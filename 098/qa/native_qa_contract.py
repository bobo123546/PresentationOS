"""
PowerPoint Native QA Contract Verifier.
Defines the strict 10-tier verification status matrix and evaluates
whether PowerPoint Native validation ran, succeeded, or was unavailable.
"""
from __future__ import annotations
from enum import Enum
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


class NativeVerificationTier(str, Enum):
    PACKAGE_PASS = "PACKAGE_PASS"                      # PPTX zip/XML packaging valid
    SCHEMA_PASS = "SCHEMA_PASS"                        # OpenXML/DeckSpec schema valid
    NATIVE_OPEN_PASS = "NATIVE_OPEN_PASS"              # PowerPoint COM opened without repair alert
    NATIVE_SAVE_REOPEN_PASS = "NATIVE_SAVE_REOPEN_PASS"# Re-saved PPTX reopened cleanly
    PDF_EXPORT_PASS = "PDF_EXPORT_PASS"                # Exported PDF cleanly via native COM
    VISUAL_RENDER_PASS = "VISUAL_RENDER_PASS"          # Exported slide PNGs visual fidelity verified
    SEMANTIC_READBACK_PASS = "SEMANTIC_READBACK_PASS"  # Text & object counts readback match source
    EDITABILITY_PASS = "EDITABILITY_PASS"              # Shapes and text boxes remain interactive
    MEDIA_UNVERIFIED = "MEDIA_UNVERIFIED"              # Audio/video tracks not verified
    OFFICE_UNAVAILABLE = "OFFICE_UNAVAILABLE"          # PowerPoint not installed in environment
    NOT_ATTEMPTED = "NOT_ATTEMPTED"                    # Did not run native verification


# Compatibility alias
NativeQAStatus = NativeVerificationTier


@dataclass
class NativeVerificationResult:
    highest_tier: NativeVerificationTier
    passed_tiers: List[NativeVerificationTier]
    failed_tiers: List[NativeVerificationTier]
    is_release_ready: bool
    diagnostic_details: Dict[str, Any] = field(default_factory=dict)

    @property
    def status(self) -> NativeVerificationTier:
        return self.highest_tier

    @property
    def passed(self) -> bool:
        return self.is_release_ready

    @property
    def error_message(self) -> Optional[str]:
        return self.diagnostic_details.get("reason") or self.diagnostic_details.get("error")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "highest_tier": self.highest_tier.value,
            "passed_tiers": [t.value for t in self.passed_tiers],
            "failed_tiers": [t.value for t in self.failed_tiers],
            "is_release_ready": self.is_release_ready,
            "diagnostic_details": self.diagnostic_details,
        }


# Compatibility alias
NativeQAResult = NativeVerificationResult


class NativeQAContract:
    """
    Evaluates execution results from PowerPoint COM automation and enforces that
    simulated or missing Office runs cannot claim NATIVE_OPEN_PASS or PDF_EXPORT_PASS.
    """

    REQUIRED_PRODUCTION_TIERS = [
        NativeVerificationTier.PACKAGE_PASS,
        NativeVerificationTier.SCHEMA_PASS,
        NativeVerificationTier.NATIVE_OPEN_PASS,
        NativeVerificationTier.NATIVE_SAVE_REOPEN_PASS,
        NativeVerificationTier.PDF_EXPORT_PASS,
        NativeVerificationTier.SEMANTIC_READBACK_PASS,
        NativeVerificationTier.EDITABILITY_PASS
    ]

    @classmethod
    def evaluate_run(
        cls,
        has_office: bool,
        com_open_success: bool,
        com_save_reopen_success: bool,
        pdf_generated: bool,
        readback_match: bool,
        editability_intact: bool,
        package_valid: bool = True,
        schema_valid: bool = True
    ) -> NativeVerificationResult:
        passed = []
        failed = []

        if package_valid:
            passed.append(NativeVerificationTier.PACKAGE_PASS)
        else:
            failed.append(NativeVerificationTier.PACKAGE_PASS)

        if schema_valid:
            passed.append(NativeVerificationTier.SCHEMA_PASS)
        else:
            failed.append(NativeVerificationTier.SCHEMA_PASS)

        if not has_office:
            failed.append(NativeVerificationTier.OFFICE_UNAVAILABLE)
            return NativeVerificationResult(
                highest_tier=NativeVerificationTier.SCHEMA_PASS if schema_valid else NativeVerificationTier.PACKAGE_PASS,
                passed_tiers=passed,
                failed_tiers=[NativeVerificationTier.OFFICE_UNAVAILABLE],
                is_release_ready=False,
                diagnostic_details={"reason": "PowerPoint is not installed; cannot verify native fidelity."}
            )

        if com_open_success:
            passed.append(NativeVerificationTier.NATIVE_OPEN_PASS)
        else:
            failed.append(NativeVerificationTier.NATIVE_OPEN_PASS)

        if com_save_reopen_success:
            passed.append(NativeVerificationTier.NATIVE_SAVE_REOPEN_PASS)
        else:
            failed.append(NativeVerificationTier.NATIVE_SAVE_REOPEN_PASS)

        if pdf_generated:
            passed.append(NativeVerificationTier.PDF_EXPORT_PASS)
        else:
            failed.append(NativeVerificationTier.PDF_EXPORT_PASS)

        if readback_match:
            passed.append(NativeVerificationTier.SEMANTIC_READBACK_PASS)
        else:
            failed.append(NativeVerificationTier.SEMANTIC_READBACK_PASS)

        if editability_intact:
            passed.append(NativeVerificationTier.EDITABILITY_PASS)
        else:
            failed.append(NativeVerificationTier.EDITABILITY_PASS)

        all_required_met = all(tier in passed for tier in cls.REQUIRED_PRODUCTION_TIERS)
        highest = passed[-1] if passed else NativeVerificationTier.OFFICE_UNAVAILABLE

        return NativeVerificationResult(
            highest_tier=highest,
            passed_tiers=passed,
            failed_tiers=failed,
            is_release_ready=all_required_met,
            diagnostic_details={
                "total_passed": len(passed),
                "total_failed": len(failed)
            }
        )
