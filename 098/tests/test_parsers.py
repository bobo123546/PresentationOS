"""Tests for source parsers (Markdown, Tabular, Routing) in PresentationOS."""
from pathlib import Path
import tempfile
from parsers.markdown_parser import MarkdownParser
from parsers.tabular_parser import TabularParser
from parsers.registry import parse_file


def test_markdown_parser_extracts_chunks_and_facts():
    sample_md = """# 主标题
这是一个测试段落，包含数字 99.99% 和金额 $50B 以及日期 2026-10-21。
- 列表项一
- 列表项二
<!-- note: 这是演讲者备注 -->
"""
    parser = MarkdownParser()
    source_ir = parser.parse_text(sample_md, file_name="sample.md")

    assert source_ir["file_name"] == "sample.md"
    assert source_ir["total_chunks"] >= 3

    # Verify extracted facts
    fact_values = [f["literal_value"] for f in source_ir["facts"]]
    assert any("99.99%" in f for f in fact_values)
    assert any("$50B" in f or "50B" in f for f in fact_values)
    assert any("2026-10-21" in f for f in fact_values)

    # Verify speaker note chunk
    notes = [c for c in source_ir["chunks"] if c["content_type"] == "speaker_note"]
    assert len(notes) == 1
    assert "演讲者备注" in notes[0]["raw_text"]


def test_tabular_parser_csv():
    csv_content = "Name,Revenue,Margin\nAlpha,100万,25%\nBeta,250万,30%\n"
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
        f.write(csv_content)
        temp_csv = Path(f.name)

    try:
        parser = TabularParser()
        res = parser.parse_file(temp_csv)
        assert res["total_chunks"] == 1
        assert "Alpha" in res["chunks"][0]["raw_text"]
        assert len(res["facts"]) >= 4  # 100万, 25%, 250万, 30%
    finally:
        if temp_csv.exists():
            temp_csv.unlink()


def test_registry_file_routing(tmp_path):
    md_file = tmp_path / "test.md"
    md_file.write_text("# 标题\n内容 100%", encoding="utf-8")

    source_ir = parse_file(md_file)
    assert source_ir["file_name"] == "test.md"
    assert len(source_ir["facts"]) >= 1
