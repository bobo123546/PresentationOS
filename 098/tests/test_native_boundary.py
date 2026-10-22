from pathlib import Path
from unittest.mock import patch
from qa.native_verifier import NativePowerPointVerifier

def test_fatal_worker_diagnostic_blocks_native_even_with_zero_exit(tmp_path):
    from types import SimpleNamespace
    with patch('qa.native_verifier.subprocess.run',return_value=SimpleNamespace(returncode=0,stdout=b'Windows fatal exception: code 0x80010108')):
        result=NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path/'missing.pptx','fatal-case')
    assert not result.is_release_ready
    assert result.diagnostic_details['fatal_signal']

def test_reusing_a_run_directory_is_rejected(tmp_path):
    (tmp_path/'evidence'/'same'/'native').mkdir(parents=True)
    import pytest
    with pytest.raises(FileExistsError): NativePowerPointVerifier(tmp_path).verify_presentation(tmp_path/'missing.pptx','same')
