"""Run native Office checks in a bounded child; preserve every failure signal."""
from pathlib import Path
import hashlib
import json
import math
import os
import re
import shutil
import stat
import subprocess
import time
import zipfile
import xml.etree.ElementTree as ET

from .native_qa_contract import NativeQAContract
from tools.evidence_manifest import source_snapshot


def _reject_linked_parents(path):
    """Inspect lexical parents before resolving; resolve() alone follows links."""
    path = Path(os.path.abspath(path))
    for current in (path, *path.parents):
        try:
            attributes = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(attributes.st_mode) or getattr(attributes, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError(f'Linked evidence paths are not allowed: {current}')
    return path


def _new_evidence_directory(data_root, run_id):
    if not isinstance(run_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', run_id):
        raise ValueError('run_id must be a single safe identifier')
    if run_id.upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
        raise ValueError('run_id cannot be a reserved device name')
    root = _reject_linked_parents(data_root)
    directory = _reject_linked_parents(root / 'evidence' / run_id / 'native')
    if not directory.is_relative_to(root):
        raise ValueError('Evidence path escapes data root')
    directory.mkdir(parents=True, exist_ok=False)
    _reject_linked_parents(directory)
    return directory


def _cleanup_owned_process(directory, details):
    ownership = directory / 'owned-process.json'
    if not ownership.exists():
        return False
    try:
        import psutil
        owner = json.loads(ownership.read_text(encoding='utf-8'))
        pid, created = owner['pid'], owner['created']
        if type(pid) is not int or pid <= 0 or type(created) not in (int, float) or not math.isfinite(created) or created <= 0:
            raise ValueError('Invalid process ownership record')
        for _ in range(30):
            try:
                process = psutil.Process(pid)
                if process.name().lower() != 'powerpnt.exe' or abs(process.create_time() - created) >= .01:
                    details['ownership_pid_reused'] = True
                    return True  # The recorded process is gone; preserve the replacement.
            except psutil.NoSuchProcess:
                return True
            time.sleep(.1)
        # Recheck identity immediately before termination; never kill a reused PID.
        process = psutil.Process(pid)
        if process.name().lower() != 'powerpnt.exe' or abs(process.create_time() - created) >= .01:
            details['ownership_pid_reused'] = True
            return True
        process.terminate()
        details['forced_cleanup'] = True
        process.wait(timeout=5)
        return True
    except Exception as error:
        details['cleanup_error'] = repr(error)
        return False


class NativePowerPointVerifier:
    def __init__(self, data_root=None):
        self.data_root = Path(data_root or os.environ.get('PRES_DATA_DIR', r'D:\PresentationOSData'))

    def verify_presentation(self, pptx_path, run_id, expected_slides=1, export_thumbnails=True):
        if type(expected_slides) is not int or expected_slides < 1:
            raise ValueError('expected_slides must be a positive integer')
        directory = _new_evidence_directory(self.data_root, run_id)
        request = directory / 'request.json'
        request.write_text(json.dumps({'pptx': str(Path(pptx_path).absolute()), 'directory': str(directory), 'expected_slides': expected_slides}), encoding='utf-8')
        package = False
        try:
            with zipfile.ZipFile(pptx_path) as archive:
                package = archive.testzip() is None
                for name in archive.namelist():
                    if name.endswith('.xml'):
                        ET.fromstring(archive.read(name))
        except Exception:
            package = False
        worker = Path(__file__).resolve().parents[2] / 'workers/powerpoint-dotnet/src/PresentationOS.PowerPoint/bin/Release/net8.0/PresentationOS.PowerPoint.Worker.dll'
        local_dotnet = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/dotnet/dotnet.exe'
        dotnet = os.environ.get('PRES_DOTNET') or shutil.which('dotnet') or str(local_dotnet)
        command = [dotnet, str(worker), '--native-probe', str(request)]
        exit_code, output, details, cleanup = 127, b'', {}, False
        try:
            try:
                process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
                exit_code, output = process.returncode, process.stdout
            except subprocess.TimeoutExpired as error:
                exit_code, output = 124, error.stdout or b''
                details['error'] = 'Native worker timed out'
            except OSError as error:
                details['error'] = f'Native worker could not start: {error!r}'
            (directory / 'worker.log').write_bytes(output)
            result_file = directory / 'probe-result.json'
            try:
                if result_file.exists():
                    payload = json.loads(result_file.read_text(encoding='utf-8'))
                    if not isinstance(payload, dict):
                        raise ValueError('Native worker result must be an object')
                    details.update(payload)
                else:
                    details['result_error'] = 'Native worker did not write probe-result.json'
            except (OSError, ValueError) as error:
                details['result_error'] = f'Invalid native worker result: {error!r}'
        finally:
            cleanup = _cleanup_owned_process(directory, details)
        fatal = b'fatal exception' in output.lower() or b'0x80010108' in output.lower()
        details.update({'command': command, 'exit_code': exit_code, 'process_cleanup_verified': cleanup, 'fatal_signal': fatal, 'log': str(directory / 'worker.log'), 'worker_sha256': hashlib.sha256(worker.read_bytes()).hexdigest() if worker.exists() else None})
        ok = exit_code == 0 and not fatal and details.get('operation_success') is True and not any(details.get(key) for key in ('error', 'result_error', 'close_error', 'quit_error', 'forced_cleanup', 'cleanup_error'))
        result = NativeQAContract.evaluate_run(has_office=bool(details.get('office_available')), com_open_success=ok and details.get('open', False), com_save_reopen_success=ok and details.get('save_reopen', False), pdf_generated=ok and details.get('pdf', False), readback_match=ok and details.get('semantic', False), editability_intact=ok and details.get('editability', False), package_valid=package, schema_valid=False, visual_verified=False, font_verified=False, repair_dialog_checked=ok and bool(details.get('dialog_polls')) and not details.get('dialog_observer_error') and not details.get('dialogs'), process_cleanup_verified=cleanup)
        details['source_snapshot'] = source_snapshot()
        result.diagnostic_details.update(details)
        result.diagnostic_details['reason'] = 'Limited native operations only; OpenXML schema, font substitution and visual fidelity remain unverified'
        (directory / 'verification.json').write_text(json.dumps(result.to_dict(), ensure_ascii=False, indent=2), encoding='utf-8')
        return result
