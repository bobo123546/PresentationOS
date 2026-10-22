import os
import sys
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.resolved_scene import ResolvedScene, ResolvedSlide, ResolvedElement, BoundingBox, TextStyle
from qa.mechanical_qa import MechanicalQA, Severity


def test_detect_negative_coords_and_invalid_dimensions():
    scene = ResolvedScene(deck_id="deck_defect")
    slide = ResolvedSlide(slide_id="slide_err", slide_index=1)

    # Negative coordinate element
    el_neg = ResolvedElement(
        element_id="el_neg",
        kind="shape",
        box=BoundingBox(-10, 20, 100, 50)
    )
    # Zero width element
    el_zero_w = ResolvedElement(
        element_id="el_zero",
        kind="shape",
        box=BoundingBox(50, 50, 0, 100)
    )
    slide.elements.extend([el_neg, el_zero_w])
    scene.slides.append(slide)

    issues = MechanicalQA.audit_scene(scene)
    codes = [i.code for i in issues]
    assert "ERR_NEGATIVE_COORD" in codes
    assert "ERR_INVALID_DIMENSION" in codes

    blocking_issues = [i for i in issues if i.is_blocking()]
    assert len(blocking_issues) >= 2


def test_detect_canvas_overflow_and_collision():
    scene = ResolvedScene(deck_id="deck_overflow", slide_width=960.0, slide_height=540.0)
    slide = ResolvedSlide(slide_id="slide_main", slide_index=1)

    # Overflow element exceeding width
    el_overflow = ResolvedElement(
        element_id="el_overflow",
        kind="shape",
        box=BoundingBox(800, 50, 250, 100)  # right = 1050 > 960
    )
    # Colliding elements
    el_a = ResolvedElement(
        element_id="box_a",
        kind="text",
        box=BoundingBox(100, 100, 200, 100),
        content="Block A"
    )
    el_b = ResolvedElement(
        element_id="box_b",
        kind="text",
        box=BoundingBox(150, 150, 200, 100),  # Collides with box_a
        content="Block B"
    )
    slide.elements.extend([el_overflow, el_a, el_b])
    scene.slides.append(slide)

    issues = MechanicalQA.audit_scene(scene)
    codes = [i.code for i in issues]
    assert "ERR_CANVAS_OVERFLOW" in codes
    assert "ERR_OBJECT_COLLISION" in codes


def test_clean_scene_passes_mechanical_qa():
    scene = ResolvedScene(deck_id="deck_clean", slide_width=960.0, slide_height=540.0)
    slide = ResolvedSlide(slide_id="slide_ok", slide_index=1)

    el1 = ResolvedElement(
        element_id="header",
        kind="text",
        box=BoundingBox(50, 50, 800, 60),
        content="Quarterly Financial Overview"
    )
    el2 = ResolvedElement(
        element_id="content_left",
        kind="text",
        box=BoundingBox(50, 150, 380, 300),
        content="Key business drivers and performance indicators."
    )
    el3 = ResolvedElement(
        element_id="content_right",
        kind="text",
        box=BoundingBox(480, 150, 380, 300),
        content="Strategic initiatives and next quarter milestones."
    )
    slide.elements.extend([el1, el2, el3])
    scene.slides.append(slide)

    issues = MechanicalQA.audit_scene(scene)
    blocking = [i for i in issues if i.is_blocking()]
    assert len(blocking) == 0
