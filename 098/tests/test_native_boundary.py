from pathlib import Path
import json
import subprocess
from unittest.mock import patch
from qa.native_verifier import NativePowerPointVerifier
import pytest

def test_fatal_worker_diagnostic_blocks_native_even_with_zero_exit(tmp_path):
    from types import SimpleNamespace
    real_run = subprocess.run
    def run_worker_or_metadata(command, *args, **kwargs):
        if '--native-probe' in command:
            return SimpleNamespace(returncode=0, stdout=b'Windows fatal exception: code 0x80010108')
        return real_run(command, *args, **kwargs)
    with patch('qa.native_verifier.subprocess.run', side_effect=run_worker_or_metadata):
        result=NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path/'missing.pptx','fatal-case')
    assert not result.is_release_ready
    assert result.diagnostic_details['fatal_signal']
    saved = json.loads((tmp_path/'evidence'/'fatal-case'/'native'/'verification.json').read_text(encoding='utf-8'))
    assert saved['diagnostic_details']['fatal_signal']
    assert isinstance(saved['diagnostic_details']['source_snapshot']['git_status'], str)

def test_reusing_a_run_directory_is_rejected(tmp_path):
    (tmp_path/'evidence'/'same'/'native').mkdir(parents=True)
    import pytest
    with pytest.raises(FileExistsError): NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path/'missing.pptx','same')


@pytest.mark.parametrize('run_id', ['../escape', r'..\escape', '/absolute', r'C:\absolute', 'a/b', '.', '', 'CON'])
def test_run_id_cannot_escape_the_data_root(tmp_path, run_id):
    with patch('qa.native_verifier.subprocess.run') as worker:
        with pytest.raises(ValueError, match='run_id'):
            NativePowerPointVerifier(tmp_path / 'data').verify_presentation(tmp_path / 'missing.pptx', run_id)
    worker.assert_not_called()
    assert not (tmp_path / 'data').exists()


def test_linked_evidence_parent_is_rejected_without_writing_target(tmp_path):
    data = tmp_path / 'data'
    data.mkdir()
    target = tmp_path / 'outside'
    target.mkdir()
    link = data / 'evidence'
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError:
        # Directory junctions do not require Windows developer-mode privileges.
        import os
        if os.name != 'nt':
            raise
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)], check=True, capture_output=True)
    with pytest.raises(ValueError, match='Linked evidence'):
        NativePowerPointVerifier(data).verify_presentation(tmp_path / 'missing.pptx', 'linked')
    assert not list(target.iterdir())


def test_missing_worker_runtime_produces_failure_evidence(tmp_path):
    with patch('qa.native_verifier.subprocess.run', side_effect=FileNotFoundError('missing dotnet')), patch('qa.native_verifier.source_snapshot', return_value={'dirty': False}):
        result = NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path / 'missing.pptx', 'runtime-missing')
    details = result.diagnostic_details
    assert details['exit_code'] == 127
    assert 'could not start' in details['error']
    assert not result.is_release_ready
    saved = json.loads((tmp_path / 'evidence/runtime-missing/native/verification.json').read_text())
    assert saved['diagnostic_details']['exit_code'] == 127


def test_corrupt_worker_json_still_checks_owned_process_and_writes_failure(tmp_path):
    from types import SimpleNamespace
    import psutil
    def worker(command, **kwargs):
        directory = Path(command[-1]).parent
        (directory / 'probe-result.json').write_text('{broken')
        (directory / 'owned-process.json').write_text(json.dumps({'pid': 12345, 'created': 123.0}))
        return SimpleNamespace(returncode=0, stdout=b'')
    with patch('qa.native_verifier.subprocess.run', side_effect=worker), patch('qa.native_verifier.source_snapshot', return_value={}), patch('psutil.Process', side_effect=psutil.NoSuchProcess(12345)) as lookup:
        result = NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path / 'missing.pptx', 'corrupt-result')
    lookup.assert_called_once_with(12345)
    assert 'Invalid native worker result' in result.diagnostic_details['result_error']
    assert result.diagnostic_details['process_cleanup_verified']
    assert not result.is_release_ready
    assert (tmp_path / 'evidence/corrupt-result/native/verification.json').exists()


def test_timed_out_worker_cleanup_preserves_a_reused_pid(tmp_path):
    from unittest.mock import Mock
    def worker(command, **kwargs):
        directory = Path(command[-1]).parent
        (directory / 'owned-process.json').write_text(json.dumps({'pid': 12345, 'created': 123.0}))
        raise subprocess.TimeoutExpired(command, 90, output=b'partial log')
    replacement = Mock()
    replacement.name.return_value = 'POWERPNT.EXE'
    replacement.create_time.return_value = 456.0
    with patch('qa.native_verifier.subprocess.run', side_effect=worker), patch('qa.native_verifier.source_snapshot', return_value={}), patch('psutil.Process', return_value=replacement):
        result = NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path / 'missing.pptx', 'timeout-reused')
    replacement.terminate.assert_not_called()
    assert result.diagnostic_details['ownership_pid_reused']
    assert result.diagnostic_details['process_cleanup_verified']
    assert result.diagnostic_details['exit_code'] == 124
    assert not result.is_release_ready
    assert (tmp_path / 'evidence/timeout-reused/native/worker.log').read_bytes() == b'partial log'


def test_forced_cleanup_is_recorded_and_cannot_certify_native_operations(tmp_path):
    from types import SimpleNamespace
    from unittest.mock import Mock
    def worker(command, **kwargs):
        directory = Path(command[-1]).parent
        (directory / 'owned-process.json').write_text(json.dumps({'pid': 12345, 'created': 123.0}))
        (directory / 'probe-result.json').write_text(json.dumps({'operation_success': True, 'office_available': True, 'open': True, 'save_reopen': True, 'semantic': True, 'pdf': True, 'editability': True}))
        return SimpleNamespace(returncode=0, stdout=b'')
    owned = Mock()
    owned.name.return_value = 'POWERPNT.EXE'
    owned.create_time.return_value = 123.0
    with patch('qa.native_verifier.subprocess.run', side_effect=worker), patch('qa.native_verifier.source_snapshot', return_value={}), patch('qa.native_verifier.time.sleep'), patch('psutil.Process', return_value=owned):
        result = NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path / 'missing.pptx', 'forced-cleanup')
    owned.terminate.assert_called_once()
    assert result.diagnostic_details['forced_cleanup']
    assert result.diagnostic_details['process_cleanup_verified']
    assert not result.is_release_ready
    assert not result.diagnostic_details['total_passed']
