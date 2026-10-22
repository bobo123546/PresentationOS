"""Tests for Narrative planning and Layout solving."""
from parsers.markdown_parser import MarkdownParser
from narrative.narrative_planner import NarrativePlanner
from layout.layout_solver import LayoutSolver
from design.design_tokens import get_theme


def test_narrative_planning_from_markdown():
    text = """# 技术方案
## 议程规划
- 第一步
- 第二步
## 核心指标
性能达到 99.99%，覆盖 15个 模块。
## 对比数据
| 项 | 值 |
| A | 1 |
| B | 2 |
"""
    parser = MarkdownParser()
    source_ir = parser.parse_text(text)

    planner = NarrativePlanner()
    deck = planner.plan(source_ir)

    assert deck.title == "技术方案"
    assert len(deck.slides) >= 5  # Title, Agenda, BigMetric, DataTable, Conclusion
    layout_types = [s.layout_type for s in deck.slides]
    assert "title_slide" in layout_types
    assert "agenda" in layout_types
    assert "big_metric" in layout_types
    assert "data_table" in layout_types
    assert "conclusion" in layout_types


def test_layout_solver_produces_valid_resolved_scene():
    text = """# 架构展示
## 核心能力
- 模块一：极速解析
- 模块二：无损修订
"""
    parser = MarkdownParser()
    source_ir = parser.parse_text(text)
    deck = NarrativePlanner().plan(source_ir)

    theme = get_theme("tech_dark")
    solver = LayoutSolver(theme=theme)
    scene = solver.solve_deck(deck)

    assert scene.canvas_width == 1920.0
    assert scene.canvas_height == 1080.0
    assert len(scene.slides) == len(deck.slides)

    # Verify no coordinates are negative
    for slide in scene.slides:
        assert len(slide.nodes) > 0
        for node in slide.nodes:
            assert node.bounds.x >= 0
            assert node.bounds.y >= 0
            assert node.bounds.width > 0
            assert node.bounds.height > 0
            # Ensure within canvas boundaries
            assert node.bounds.x + node.bounds.width <= scene.canvas_width + 1.0
            assert node.bounds.y + node.bounds.height <= scene.canvas_height + 1.0
