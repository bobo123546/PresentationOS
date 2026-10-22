"""Core runtime package for PresentationOS."""
from .resolved_scene import (
    BoundingBox,
    TextStyle,
    ResolvedElement,
    ResolvedNode,
    ResolvedSlide,
    ResolvedScene,
    estimate_text_bounds,
)
from .revision_engine import (
    ActionType,
    RevisionAction,
    RevisionPlan,
    RevisionEngine,
)
from .content_provenance import ContentProvenance, ContentProvenanceTracker, PreservedFact
from .orchestrator import CompileResult, PresentationOrchestrator

RevisionItem = RevisionAction

__all__ = [
    "BoundingBox",
    "TextStyle",
    "ResolvedElement",
    "ResolvedNode",
    "ResolvedSlide",
    "ResolvedScene",
    "estimate_text_bounds",
    "ActionType",
    "RevisionAction",
    "RevisionItem",
    "RevisionPlan",
    "RevisionEngine",
    "ContentProvenance",
    "ContentProvenanceTracker",
    "PreservedFact",
    "PresentationOrchestrator",
    "CompileResult",
]
