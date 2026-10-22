"""
20-Point Release Gate Automated Verifier (Section XII).
Blocks RELEASE_READY certification if any of the 20 criteria fail.
"""
from __future__ import annotations
from typing import Dict, Any, List
from dataclasses import dataclass, field


@dataclass
class GateCheckResult:
    check_id: int
    name: str
    passed: bool
    reason: str


@dataclass
class ReleaseGateAudit:
    is_release_ready: bool
    passed_count: int
    total_count: int
    checks: List[GateCheckResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.is_release_ready

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_release_ready": self.is_release_ready,
            "passed": self.is_release_ready,
            "passed_count": self.passed_count,
            "total_count": self.total_count,
            "blockers": [c.name for c in self.checks if not c.passed],
            "checks": [
                {
                    "check_id": c.check_id,
                    "name": c.name,
                    "passed": c.passed,
                    "reason": c.reason,
                }
                for c in self.checks
            ],
        }


class ReleaseGateVerifier:
    """
    Automated check of the 20 release gate requirements defined in the Master Plan.
    """

    GATE_NAMES = [
        "Status files and docs synchronized",
        "Evidence corresponds to current git commit",
        "Input sources traceable via SourceIR",
        "Content numbers, dates, and units verified",
        "No silent schema drops in renderer",
        "Revision causes no unapproved fact loss",
        "Zero S0/S1 blocking mechanical issues",
        "Real rendering complete without empty elements",
        "PowerPoint native save, reopen, and readback verified",
        "Worker cancellation state deterministic",
        "Workflow crash recovery verified",
        "Plugin sandbox path boundaries enforced",
        "Logs and spool desensitized",
        "Local mode strictly fail-closed against cloud leak",
        "Artifacts maintain run provenance",
        "Critical and High vulnerabilities triaged",
        "Licenses and asset sources audited (106/106 SBOM)",
        "Clean environment installation validated",
        "Upgrade and rollback verified",
        "Complete Release Manifest generated"
    ]

    @classmethod
    def evaluate_release(cls, status_dict: Dict[int, bool], details: Dict[int, str] = None) -> ReleaseGateAudit:
        results = []
        details = details or {}

        for idx, name in enumerate(cls.GATE_NAMES, 1):
            passed = status_dict.get(idx, False)
            reason = details.get(idx, "Passed verification" if passed else "Gate requirement not met")
            results.append(GateCheckResult(check_id=idx, name=name, passed=passed, reason=reason))

        passed_count = sum(1 for r in results if r.passed)
        total_count = len(results)
        ready = (passed_count == total_count)

        return ReleaseGateAudit(
            is_release_ready=ready,
            passed_count=passed_count,
            total_count=total_count,
            checks=results
        )


# Compatibility alias
ReleaseGate = ReleaseGateVerifier
