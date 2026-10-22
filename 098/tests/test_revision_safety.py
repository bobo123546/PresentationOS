import os
import sys
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.resolved_scene import ResolvedScene, ResolvedSlide, ResolvedElement, BoundingBox, TextStyle
from core.revision_engine import (
    RevisionEngine,
    RevisionAction,
    ActionType,
    ChangePlan
)


def create_sample_scene():
    scene = ResolvedScene(deck_id="deck_rev_test")
    slide = ResolvedSlide(slide_id="slide_1", slide_index=1)
    el1 = ResolvedElement(
        element_id="el_header",
        kind="text",
        box=BoundingBox(50, 50, 400, 40),
        style=TextStyle(font_size=24),
        content="2026 Annual Enterprise Growth Strategy"
    )
    el2 = ResolvedElement(
        element_id="el_body",
        kind="text",
        box=BoundingBox(50, 100, 400, 200),
        style=TextStyle(font_size=14),
        content="Revenue grew by 45% reaching $120M with 15,000 active clients."
    )
    slide.elements.extend([el1, el2])
    scene.slides.append(slide)
    return scene


def test_lossless_plan_application():
    scene = create_sample_scene()
    plan = ChangePlan(
        plan_id="plan_font_adjust",
        deck_hash="hash_123",
        actions=[
            RevisionAction(
                action_type=ActionType.ADJUST_FONT,
                target_slide_id="slide_1",
                target_element_id="el_header",
                params={"font_size": 20.0}
            )
        ]
    )

    assert plan.is_lossy is False
    assert plan.requires_human_approval is False

    result = RevisionEngine.apply_plan(scene, plan, allow_lossy=False)
    assert result.success is True
    assert result.applied_scene is not None
    # Verify font size changed in target element
    header = result.applied_scene.slides[0].get_element("el_header")
    assert header.style.font_size == 20.0
    # Content was not lost
    assert header.content == "2026 Annual Enterprise Growth Strategy"


def test_lossy_plan_rejected_without_approval():
    scene = create_sample_scene()
    plan = ChangePlan(
        plan_id="plan_truncate",
        deck_hash="hash_123",
        actions=[
            RevisionAction(
                action_type=ActionType.TRUNCATE_TEXT,
                target_slide_id="slide_1",
                target_element_id="el_body",
                params={"max_length": 20}
            )
        ]
    )

    assert plan.is_lossy is True
    assert plan.requires_human_approval is True

    # Attempting to apply without allow_lossy must be blocked
    result = RevisionEngine.apply_plan(scene, plan, allow_lossy=False)
    assert result.success is False
    assert result.content_loss_detected is True
    assert "without explicit human approval" in (result.error_message or "")


def test_non_destructive_slide_split():
    scene = create_sample_scene()
    plan = ChangePlan(
        plan_id="plan_split",
        deck_hash="hash_123",
        actions=[
            RevisionAction(
                action_type=ActionType.SPLIT_SLIDE,
                target_slide_id="slide_1",
                target_element_id=None,
                params={"split_element_index": 1}
            )
        ]
    )

    result = RevisionEngine.apply_plan(scene, plan, allow_lossy=False)
    assert result.success is True
    new_scene = result.applied_scene
    # Must now have 2 slides
    assert len(new_scene.slides) == 2
    assert new_scene.slides[0].slide_id == "slide_1"
    assert new_scene.slides[1].slide_id == "slide_1_part2"
    # Original text across slides is strictly preserved
    assert len(new_scene.slides[0].elements) == 1
    assert len(new_scene.slides[1].elements) == 1
    assert RevisionEngine.calculate_scene_character_count(new_scene) == RevisionEngine.calculate_scene_character_count(scene)
