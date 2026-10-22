"""Quality Assurance package for PresentationOS."""
from .mechanical_qa import MechanicalQA, Severity, QAIssue
from .native_qa_contract import (
    NativeQAContract,
    NativeVerificationTier,
    NativeVerificationResult,
    NativeQAStatus,
    NativeQAResult,
)
from .native_verifier import NativePowerPointVerifier

__all__ = [
    "MechanicalQA",
    "Severity",
    "QAIssue",
    "NativeQAContract",
    "NativeVerificationTier",
    "NativeVerificationResult",
    "NativeQAStatus",
    "NativeQAResult",
    "NativePowerPointVerifier",
]
