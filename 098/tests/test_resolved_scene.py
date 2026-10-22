import os
import sys
import pytest

# Ensure 098 directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.resolved_scene import (
    ResolvedScene,
    ResolvedSlide,
    ResolvedElement,
    BoundingBox,
    TextStyle,
    RenderStatus
)


def test_bounding_box_overlap_and_bounds():
    b1 = BoundingBox(10, 10, 100, 50)
    b2 = BoundingBox(50, 20, 100, 50)  # Overlaps b1
    b3 = BoundingBox(200, 200, 50, 50) # Separate

    assert b1.overlaps(b2) is True
    assert b1.overlaps(b3) is False
    assert b1.is_valid() is True

    bad_box = BoundingBox(-5, 10, 50, 50)
    assert bad_box.is_valid() is False


def test_text_bound_estimation_cjk_ascii():
    el_cjk = ResolvedElement(
        element_id="t1",
        kind="text",
        box=BoundingBox(0, 0, 100, 30),
        style=TextStyle(font_size=10, line_height=1.2),
        content="你好世界"  # 4 CJK chars -> 4 * 10 = 40pt
    )
    est_cjk = el_cjk.estimate_text_bounds()
    assert est_cjk.w == 40.0
    assert est_cjk.h == 12.0

    el_ascii = ResolvedElement(
        element_id="t2",
        kind="text",
        box=BoundingBox(0, 0, 100, 30),
        style=TextStyle(font_size=10, line_height=1.2),
        content="Hello"  # 5 ASCII chars -> 5 * 5.5 = 27.5pt
    )
    est_ascii = el_ascii.estimate_text_bounds()
    assert est_ascii.w == 27.5


def test_resolved_scene_serialization():
    scene = ResolvedScene(deck_id="test_deck")
    slide = ResolvedSlide(slide_id="s1", slide_index=1)
    el = ResolvedElement(
        element_id="el1",
        kind="shape",
        box=BoundingBox(50, 50, 200, 100),
        render_status=RenderStatus.SUPPORTED
    )
    slide.elements.append(el)
    scene.slides.append(slide)

    data = scene.to_dict()
    assert data["deck_id"] == "test_deck"
    assert len(data["slides"]) == 1

    restored = ResolvedScene.from_dict(data)
    assert restored.deck_id == "test_deck"
    assert len(restored.slides) == 1
    assert restored.slides[0].elements[0].box.w == 200.0
