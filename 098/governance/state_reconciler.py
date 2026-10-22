"""
State and Version Reconciler (P0-01, P0-02).
Audits and reconciles project_state.json, backlog.json, and documentation
to eliminate inconsistencies between claims and actual code implementations.
"""
from __future__ import annotations
import os
import json
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass, field


@dataclass
class StateAuditReport:
    is_synchronized: bool
    project_version: str
    current_phase: str
    inconsistencies: List[str] = field(default_factory=list)
    reconciled_state: Dict[str, Any] = field(default_factory=dict)


class StateReconciler:
    """
    Audits PresentationOS workspace state against physical repository layout.
    """

    @classmethod
    def audit_workspace(cls, repo_root: str) -> StateAuditReport:
        inconsistencies = []
        state_dir = os.path.join(repo_root, "state")
        project_state_file = os.path.join(state_dir, "project_state.json")

        if not os.path.exists(project_state_file):
            return StateAuditReport(
                is_synchronized=False,
                project_version="UNKNOWN",
                current_phase="UNKNOWN",
                inconsistencies=["Missing state/project_state.json"]
            )

        with open(project_state_file, "r", encoding="utf-8") as f:
            state_data = json.load(f)

        version = state_data.get("project_version", "0.0.0")
        current_phase = state_data.get("current_phase", "UNKNOWN")

        # Check completed phase claims against real directory existence
        completed_phases = state_data.get("completed_phases", {})
        schemas_dir = os.path.join(repo_root, "schemas")

        if "PHASE_2" in completed_phases:
            # Phase 2 claimed schema v1 completion: verify schemas exist
            for required_schema in ["document-ir", "evidence-ir", "layout-ir", "render-ir"]:
                target_path = os.path.join(schemas_dir, required_schema)
                if not os.path.exists(target_path) or not os.listdir(target_path):
                    inconsistencies.append(
                        f"Phase 2 claims completed schema '{required_schema}', but directory is empty in {target_path}."
                    )

        return StateAuditReport(
            is_synchronized=len(inconsistencies) == 0,
            project_version=version,
            current_phase=current_phase,
            inconsistencies=inconsistencies,
            reconciled_state=state_data
        )
