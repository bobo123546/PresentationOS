import os
import sys
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from governance.state_reconciler import StateReconciler


def test_state_reconciler_detects_empty_schema_claims():
    # Auditing D:\PresentationOS root should catch empty schemas as noted in Section II
    repo_root = os.path.dirname(BASE_DIR)
    report = StateReconciler.audit_workspace(repo_root)

    assert report.project_version == "0.1.0-alpha"
    assert report.current_phase == "PHASE_9_IN_PROGRESS"
    # It must detect that schemas/evidence-ir, layout-ir, render-ir are currently empty in parent repo!
    assert report.is_synchronized is False
    assert any("evidence-ir" in err for err in report.inconsistencies)
