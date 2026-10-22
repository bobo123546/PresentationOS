from pathlib import Path
import json
import subprocess
from unittest.mock import patch
from qa.native_verifier import NativePowerPointVerifier

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
