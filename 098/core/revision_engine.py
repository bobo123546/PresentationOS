"""
Safe Revision Engine with Non-Destructive Guarantees.
Prevents content loss, slide identity drifting, and score-gaming (P0-07).
Ensures atomic change transactions with complete rollback support.
"""
from __future__ import annotations
import copy
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from .resolved_scene import ResolvedScene, ResolvedSlide, ResolvedElement, BoundingBox


class ActionType(str, Enum):
    # Lossless actions (safe for automatic application)
    SPLIT_SLIDE = "SPLIT_SLIDE"
    REFLOW = "REFLOW"
    RESIZE_REGION = "RESIZE_REGION"
    ADJUST_FONT = "ADJUST_FONT"
    CHANGE_LAYOUT = "CHANGE_LAYOUT"
    REDUCE_CONTRAST = "REDUCE_CONTRAST"

    # Lossy actions (require explicit human approval, can cause fact loss)
    TRUNCATE_TEXT = "TRUNCATE_TEXT"
    SUMMARIZE = "SUMMARIZE"
    DELETE_ELEMENT = "DELETE_ELEMENT"


LOSSY_ACTIONS = {
    ActionType.TRUNCATE_TEXT,
    ActionType.SUMMARIZE,
    ActionType.DELETE_ELEMENT
}


@dataclass
class RevisionAction:
    action_type: ActionType
    target_slide_id: str
    target_element_id: Optional[str]
    params: Dict[str, Any]
    revert_patch: Dict[str, Any] = field(default_factory=dict)

    def is_lossy(self) -> bool:
        return self.action_type in LOSSY_ACTIONS


@dataclass
class ChangePlan:
    plan_id: str
    deck_hash: str
    actions: List[RevisionAction]
    is_lossy: bool = False
    lossy_reasons: List[str] = field(default_factory=list)
    requires_human_approval: bool = False

    def __post_init__(self):
        lossy_count = sum(1 for a in self.actions if a.is_lossy())
        if lossy_count > 0:
            self.is_lossy = True
            self.requires_human_approval = True
            if not self.lossy_reasons:
                self.lossy_reasons = [f"Plan contains {lossy_count} lossy action(s)"]


# Compatibility alias
RevisionPlan = ChangePlan


@dataclass
class RevisionTransactionResult:
    success: bool
    applied_scene: Optional[ResolvedScene]
    revert_plan: Optional[ChangePlan] = None
    error_message: Optional[str] = None
    content_loss_detected: bool = False


class RevisionEngine:
    """
    Executes change plans against ResolvedScene models transactionally.
    Protects original content, validates post-revision invariants, and prevents score inflation.
    """

    @classmethod
    def calculate_scene_character_count(cls, scene: ResolvedScene) -> int:
        """Count total substantive characters across all text elements."""
        total = 0
        for s in scene.slides:
            for el in s.elements:
                if el.kind == "text" and isinstance(el.content, str):
                    total += len(el.content.strip())
        return total

    @classmethod
    def apply_plan(
        cls,
        scene: ResolvedScene,
        plan: ChangePlan,
        allow_lossy: bool = False
    ) -> RevisionTransactionResult:
        """
        Apply a change plan transactionally. If allow_lossy is False and the plan
        is lossy, rejects execution immediately.
        """
        if plan.is_lossy and not allow_lossy:
            return RevisionTransactionResult(
                success=False,
                applied_scene=None,
                error_message="Cannot apply lossy change plan without explicit human approval (P0-07 guard).",
                content_loss_detected=True
            )

        working_scene = copy.deepcopy(scene)
        revert_actions = []

        initial_char_count = cls.calculate_scene_character_count(scene)

        try:
            for action in plan.actions:
                target_slide = next((s for s in working_scene.slides if s.slide_id == action.target_slide_id), None)
                if not target_slide:
                    raise ValueError(f"Target slide '{action.target_slide_id}' not found in scene.")

                if action.action_type == ActionType.ADJUST_FONT:
                    el = target_slide.get_element(action.target_element_id or "")
                    if not el:
                        raise ValueError(f"Target element '{action.target_element_id}' not found.")
                    old_size = el.style.font_size
                    new_size = float(action.params["font_size"])
                    el.style.font_size = new_size

                    revert_actions.append(RevisionAction(
                        action_type=ActionType.ADJUST_FONT,
                        target_slide_id=target_slide.slide_id,
                        target_element_id=el.element_id,
                        params={"font_size": old_size}
                    ))

                elif action.action_type == ActionType.RESIZE_REGION:
                    el = target_slide.get_element(action.target_element_id or "")
                    if not el:
                        raise ValueError(f"Target element '{action.target_element_id}' not found.")
                    old_box = copy.deepcopy(el.box)
                    el.box.w = float(action.params.get("w", el.box.w))
                    el.box.h = float(action.params.get("h", el.box.h))

                    revert_actions.append(RevisionAction(
                        action_type=ActionType.RESIZE_REGION,
                        target_slide_id=target_slide.slide_id,
                        target_element_id=el.element_id,
                        params={"w": old_box.w, "h": old_box.h}
                    ))

                elif action.action_type == ActionType.SPLIT_SLIDE:
                    # Non-destructive slide split: creates continuation slide with remaining elements
                    split_idx = int(action.params.get("split_element_index", 1))
                    overflow_elements = target_slide.elements[split_idx:]
                    target_slide.elements = target_slide.elements[:split_idx]

                    new_slide_id = f"{target_slide.slide_id}_part2"
                    new_slide = ResolvedSlide(
                        slide_id=new_slide_id,
                        slide_index=target_slide.slide_index + 1,
                        elements=overflow_elements,
                        background_color=target_slide.background_color,
                        speaker_notes=f"Continuation of {target_slide.slide_id}"
                    )
                    insert_pos = working_scene.slides.index(target_slide) + 1
                    working_scene.slides.insert(insert_pos, new_slide)
                    # Re-index subsequent slides
                    for idx, s in enumerate(working_scene.slides, 1):
                        s.slide_index = idx

                elif action.action_type in (ActionType.TRUNCATE_TEXT, ActionType.DELETE_ELEMENT):
                    if not allow_lossy:
                        raise PermissionError(f"Lossy action {action.action_type.value} rejected without approval.")
                    el = target_slide.get_element(action.target_element_id or "")
                    if el:
                        if action.action_type == ActionType.DELETE_ELEMENT:
                            target_slide.elements.remove(el)
                        elif action.action_type == ActionType.TRUNCATE_TEXT:
                            max_len = action.params.get("max_length", 50)
                            el.content = str(el.content)[:max_len]

            # Post-check: Content loss gaming guard
            final_char_count = cls.calculate_scene_character_count(working_scene)
            if not allow_lossy and final_char_count < initial_char_count:
                return RevisionTransactionResult(
                    success=False,
                    applied_scene=None,
                    error_message=f"Score-gaming rejected: revisions caused {initial_char_count - final_char_count} characters of content loss without approval.",
                    content_loss_detected=True
                )

            revert_plan = ChangePlan(
                plan_id=f"revert_{plan.plan_id}",
                deck_hash=plan.deck_hash,
                actions=list(reversed(revert_actions))
            )

            return RevisionTransactionResult(
                success=True,
                applied_scene=working_scene,
                revert_plan=revert_plan,
                content_loss_detected=False
            )

        except Exception as e:
            return RevisionTransactionResult(
                success=False,
                applied_scene=None,
                error_message=f"Transaction rolled back due to error: {str(e)}"
            )
