import os
import sys
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from governance.state_reconciler import StateReconciler


def test_state_reconciler_detects_empty_schema_claims(tmp_path):
    import json
    (tmp_path / 'state').mkdir()
    (tmp_path / 'state' / 'project_state.json').write_text(json.dumps({'project_version':'test-version','current_phase':'PHASE_9_IN_PROGRESS','completed_phases':{'PHASE_2':'claimed'}}),encoding='utf-8')
    report = StateReconciler.audit_workspace(str(tmp_path))
    assert report.project_version == "test-version"
    assert report.current_phase == "PHASE_9_IN_PROGRESS"
    # It must detect that schemas/evidence-ir, layout-ir, render-ir are currently empty in parent repo!
    assert report.is_synchronized is False
    assert any("evidence-ir" in err for err in report.inconsistencies)
