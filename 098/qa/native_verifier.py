"""Run native Office checks in a bounded child; preserve every failure signal."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time
import zipfile
import shutil
import hashlib
import xml.etree.ElementTree as ET
from .native_qa_contract import NativeQAContract
from tools.evidence_manifest import source_snapshot

class NativePowerPointVerifier:
    def __init__(self,data_root=None):
        self.data_root=Path(data_root or os.environ.get('PRES_DATA_DIR',r'D:\PresentationOSData'))
    def verify_presentation(self,pptx_path,run_id,expected_slides=1,export_thumbnails=True):
        directory=self.data_root/'evidence'/run_id/'native'
        directory.mkdir(parents=True,exist_ok=False)
        request=directory/'request.json'
        request.write_text(json.dumps({'pptx':str(Path(pptx_path).resolve()),'directory':str(directory.resolve()),'expected_slides':expected_slides}),encoding='utf-8')
        package=False
        try:
            with zipfile.ZipFile(pptx_path) as archive:
                package=archive.testzip() is None
                for name in archive.namelist():
                    if name.endswith('.xml'): ET.fromstring(archive.read(name))
        except Exception: package=False
        worker=Path(__file__).resolve().parents[2]/'workers/powerpoint-dotnet/src/PresentationOS.PowerPoint/bin/Release/net8.0/PresentationOS.PowerPoint.Worker.dll'
        local_dotnet=Path(os.environ.get('LOCALAPPDATA',''))/'Microsoft/dotnet/dotnet.exe'
        dotnet=os.environ.get('PRES_DOTNET') or shutil.which('dotnet') or str(local_dotnet)
        command=[dotnet,str(worker),'--native-probe',str(request)]
        exit_code=127;output=b'';details={}
        try:
            process=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
            exit_code=process.returncode;output=process.stdout
        except subprocess.TimeoutExpired as error:
            exit_code=124;output=error.stdout or b'';details['error']='Native worker timed out'
        (directory/'worker.log').write_bytes(output)
        result_file=directory/'probe-result.json'
        if result_file.exists(): details.update(json.loads(result_file.read_text(encoding='utf-8')))
        cleanup=False
        ownership=directory/'owned-process.json'
        if ownership.exists():
            import psutil
            owner=json.loads(ownership.read_text(encoding='utf-8'))
            for _ in range(30):
                if not psutil.pid_exists(owner['pid']): cleanup=True;break
                time.sleep(.1)
            if not cleanup:
                try:
                    process=psutil.Process(owner['pid'])
                    if process.name().lower()=='powerpnt.exe' and abs(process.create_time()-owner['created']) < .01:
                        process.terminate();process.wait(timeout=5)
                        details['forced_cleanup']=True
                except psutil.NoSuchProcess: pass
                except Exception as error: details['cleanup_error']=repr(error)
        fatal=b'fatal exception' in output.lower() or b'0x80010108' in output.lower()
        details.update({'command':command,'exit_code':exit_code,'process_cleanup_verified':cleanup,'fatal_signal':fatal,'log':str(directory/'worker.log'),'worker_sha256':hashlib.sha256(worker.read_bytes()).hexdigest() if worker.exists() else None})
        ok=exit_code==0 and not fatal and not details.get('quit_error') and not details.get('forced_cleanup')
        result=NativeQAContract.evaluate_run(has_office=bool(details.get('office_available')),com_open_success=ok and details.get('open',False),com_save_reopen_success=ok and details.get('save_reopen',False),pdf_generated=ok and details.get('pdf',False),readback_match=ok and details.get('semantic',False),editability_intact=ok and details.get('editability',False),package_valid=package,schema_valid=False,visual_verified=False,font_verified=False,repair_dialog_checked=ok and bool(details.get('dialog_polls')) and not details.get('dialog_observer_error') and not details.get('dialogs'),process_cleanup_verified=cleanup)
        details['source_snapshot'] = source_snapshot()
        result.diagnostic_details.update(details)
        result.diagnostic_details['reason']='Limited native operations only; OpenXML schema, font substitution and visual fidelity remain unverified'
        (directory/'verification.json').write_text(json.dumps(result.to_dict(),ensure_ascii=False,indent=2),encoding='utf-8')
        return result
