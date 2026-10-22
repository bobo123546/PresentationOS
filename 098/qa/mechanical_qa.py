"""
Mechanical QA Engine.
Audits geometric validity, canvas boundary limits, collisions,
and text overflow directly against the unified ResolvedScene.
"""
from __future__ import annotations
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
try:
    from core.resolved_scene import ResolvedScene, ResolvedSlide, ResolvedElement, BoundingBox
except (ImportError, ValueError):
    from ..core.resolved_scene import ResolvedScene, ResolvedSlide, ResolvedElement, BoundingBox


class Severity(str, Enum):
    S0 = "S0"  # Critical / corruptive (blocks release)
    S1 = "S1"  # Major functional defect (blocks release)
    S2 = "S2"  # Moderate visual / layout warning
    S3 = "S3"  # Minor polish suggestion


@dataclass
class QAIssue:
    code: str
    severity: Severity
    slide_id: str
    element_id: Optional[str]
    description: str
    metrics: Dict[str, Any] = field(default_factory=dict)

    def is_blocking(self) -> bool:
        return self.severity in (Severity.S0, Severity.S1)


class MechanicalQA:
    """
    Evaluates ResolvedScene against strict geometric, boundary, and integrity rules (H01-H18).
    """

    @classmethod
    def audit_scene(cls, scene: ResolvedScene) -> List[QAIssue]:
        issues: List[QAIssue] = []
        seen_element_ids = set()

        for slide in scene.slides:
            # H07: Duplicate ID check & H01-H04 element geometry
            for el in slide.elements:
                if el.element_id in seen_element_ids:
                    issues.append(QAIssue(
                        code="ERR_DUPLICATE_ELEMENT_ID",
                        severity=Severity.S1,
                        slide_id=slide.slide_id,
                        element_id=el.element_id,
                        description=f"Duplicate element_id '{el.element_id}' found in deck."
                    ))
                seen_element_ids.add(el.element_id)

                # H01: Negative coordinates
                if el.box.x < 0 or el.box.y < 0:
                    issues.append(QAIssue(
                        code="ERR_NEGATIVE_COORD",
                        severity=Severity.S0,
                        slide_id=slide.slide_id,
                        element_id=el.element_id,
                        description=f"Element has negative coordinate (x={el.box.x}, y={el.box.y}).",
                        metrics={"x": el.box.x, "y": el.box.y}
                    ))

                # H02: Negative / zero dimensions
                if el.box.w <= 0 or el.box.h <= 0:
                    issues.append(QAIssue(
                        code="ERR_INVALID_DIMENSION",
                        severity=Severity.S0,
                        slide_id=slide.slide_id,
                        element_id=el.element_id,
                        description=f"Element has invalid width/height (w={el.box.w}, h={el.box.h}).",
                        metrics={"w": el.box.w, "h": el.box.h}
                    ))

                # H03: Canvas boundary overflow
                if el.box.right() > scene.slide_width or el.box.bottom() > scene.slide_height:
                    issues.append(QAIssue(
                        code="ERR_CANVAS_OVERFLOW",
                        severity=Severity.S1,
                        slide_id=slide.slide_id,
                        element_id=el.element_id,
                        description=f"Element exceeds slide canvas boundaries ({scene.slide_width}x{scene.slide_height}).",
                        metrics={"right": el.box.right(), "bottom": el.box.bottom()}
                    ))

                # H04: Estimated text overflow
                if el.kind == "text" and isinstance(el.content, str):
                    est = el.estimate_text_bounds()
                    if est.w > el.box.w * 1.15 or est.h > el.box.h * 1.15:
                        issues.append(QAIssue(
                            code="ERR_TEXT_OVERFLOW",
                            severity=Severity.S1,
                            slide_id=slide.slide_id,
                            element_id=el.element_id,
                            description=f"Text content estimated bounds ({est.w:.1f}x{est.h:.1f}) overflow box ({el.box.w:.1f}x{el.box.h:.1f}).",
                            metrics={"est_w": est.w, "est_h": est.h, "box_w": el.box.w, "box_h": el.box.h}
                        ))

                # H16: Empty text or missing content
                if el.kind == "text" and not str(el.content).strip():
                    issues.append(QAIssue(
                        code="WARN_EMPTY_TEXT_CONTAINER",
                        severity=Severity.S2,
                        slide_id=slide.slide_id,
                        element_id=el.element_id,
                        description="Element container is empty."
                    ))

            # H05: Object collision / unallowed overlap
            n_elem = len(slide.elements)
            for i in range(n_elem):
                for j in range(i + 1, n_elem):
                    el1 = slide.elements[i]
                    el2 = slide.elements[j]
                    # Skip background/container elements
                    if el1.kind == "container" or el2.kind == "container":
                        continue
                    if el1.box.overlaps(el2.box, margin=2.0):
                        issues.append(QAIssue(
                            code="ERR_OBJECT_COLLISION",
                            severity=Severity.S2,
                            slide_id=slide.slide_id,
                            element_id=el1.element_id,
                            description=f"Elements '{el1.element_id}' and '{el2.element_id}' collide or overlap illegally.",
                            metrics={"elem_a": el1.element_id, "elem_b": el2.element_id}
                        ))

        return issues
