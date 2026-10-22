"""Narrative planner converting SourceIR into a structured NarrativeDeck."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class NarrativeSlide:
    """Represents a single planned slide in the presentation narrative."""
    slide_index: int
    layout_type: str  # title_slide, agenda, big_metric, cards_grid, split_column, data_table, conclusion
    title: str
    subtitle: str = ""
    bullets: List[str] = field(default_factory=list)
    metrics: List[Dict[str, str]] = field(default_factory=list)
    cards: List[Dict[str, str]] = field(default_factory=list)
    table_data: Optional[Dict[str, Any]] = None
    speaker_notes: str = ""
    source_chunk_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        res: Dict[str, Any] = {
            "slide_index": self.slide_index,
            "layout_type": self.layout_type,
            "title": self.title,
            "subtitle": self.subtitle,
            "bullets": self.bullets,
            "metrics": self.metrics,
            "cards": self.cards,
            "speaker_notes": self.speaker_notes,
            "source_chunk_ids": self.source_chunk_ids,
        }
        if self.table_data:
            res["table_data"] = self.table_data
        return res


@dataclass
class NarrativeDeck:
    """Represents the complete presentation narrative plan."""
    narrative_id: str
    source_file_id: str
    title: str
    objective: str
    target_audience: str
    slides: List[NarrativeSlide] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "narrative_id": self.narrative_id,
            "source_file_id": self.source_file_id,
            "title": self.title,
            "objective": self.objective,
            "target_audience": self.target_audience,
            "slides": [s.to_dict() for s in self.slides],
        }


class NarrativePlanner:
    """Transforms raw SourceIR chunks and facts into a cohesive presentation narrative."""

    def plan(self, source_ir: Dict[str, Any], deck_title: str = "") -> NarrativeDeck:
        source_id = source_ir.get("source_id", "src_unknown")
        chunks = source_ir.get("chunks", [])
        facts = source_ir.get("facts", [])

        # Determine presentation title
        inferred_title = deck_title
        if not inferred_title:
            for c in chunks:
                if c.get("content_type") == "heading" and c.get("heading_level") in (1, None):
                    inferred_title = c.get("raw_text", "")
                    break
        if not inferred_title:
            inferred_title = source_ir.get("file_name", "Presentation").rsplit(".", 1)[0]

        slides: List[NarrativeSlide] = []
        slide_idx = 0

        # Slide 0: Title Slide
        slides.append(
            NarrativeSlide(
                slide_index=slide_idx,
                layout_type="title_slide",
                title=inferred_title,
                subtitle="PresentationOS 工业级演示文稿架构方案",
                speaker_notes=f"欢迎各位，今天我们汇报的主题是《{inferred_title}》。",
                source_chunk_ids=[c["chunk_id"] for c in chunks[:1]] if chunks else [],
            )
        )
        slide_idx += 1

        # Group remaining chunks by section
        sections: Dict[str, List[Dict[str, Any]]] = {}
        speaker_notes_by_section: Dict[str, List[str]] = {}

        current_sec = "Executive Summary"
        for c in chunks:
            c_type = c.get("content_type")
            if c_type == "heading":
                current_sec = c.get("raw_text", "Section")
                if current_sec not in sections:
                    sections[current_sec] = []
            elif c_type == "speaker_note":
                speaker_notes_by_section.setdefault(current_sec, []).append(c.get("raw_text", ""))
            else:
                sections.setdefault(current_sec, []).append(c)

        # Slide 1: Agenda / Executive Summary
        agenda_items = list(sections.keys())[:5]
        if agenda_items:
            slides.append(
                NarrativeSlide(
                    slide_index=slide_idx,
                    layout_type="agenda",
                    title="核心大纲与关键议程",
                    subtitle="AGENDA & EXECUTIVE ROADMAP",
                    bullets=[f"{i+1}. {item}" for i, item in enumerate(agenda_items)],
                    speaker_notes="本节呈现本次演示的核心目录结构与关键里程碑。",
                    source_chunk_ids=[],
                )
            )
            slide_idx += 1

        # Body slides: Process sections
        for sec_name, sec_chunks in sections.items():
            if not sec_chunks:
                continue

            sec_notes = " ".join(speaker_notes_by_section.get(sec_name, []))
            chunk_ids = [c["chunk_id"] for c in sec_chunks]

            # Look for tables
            table_chunk = next((c for c in sec_chunks if c.get("content_type") == "table"), None)
            if table_chunk:
                parsed_table = self._parse_markdown_table(table_chunk.get("raw_text", ""))
                slides.append(
                    NarrativeSlide(
                        slide_index=slide_idx,
                        layout_type="data_table",
                        title=sec_name,
                        subtitle="关键数据与指标比对分析",
                        table_data=parsed_table,
                        speaker_notes=sec_notes or f"本页呈现 {sec_name} 的详细数据比对。",
                        source_chunk_ids=[table_chunk["chunk_id"]],
                    )
                )
                slide_idx += 1
                continue

            # Look for metric facts in this section
            sec_facts = [
                f for f in facts if f.get("chunk_id") in chunk_ids and f.get("fact_type") == "numeric"
            ]
            if len(sec_facts) >= 2:
                # Use big_metric or cards_grid with metric highlights
                metrics = [
                    {"value": f["literal_value"], "label": f"指标项 {i+1}"}
                    for i, f in enumerate(sec_facts[:4])
                ]
                bullet_lines = []
                for c in sec_chunks:
                    for line in c.get("raw_text", "").splitlines():
                        clean_line = line.lstrip("-* ").strip()
                        if clean_line:
                            bullet_lines.append(clean_line)
                slides.append(
                    NarrativeSlide(
                        slide_index=slide_idx,
                        layout_type="big_metric",
                        title=sec_name,
                        subtitle="关键数值与性能指标概览",
                        metrics=metrics,
                        bullets=bullet_lines[:5],
                        speaker_notes=sec_notes or f"重点关注 {sec_name} 涉及的核心指标事实。",
                        source_chunk_ids=chunk_ids,
                    )
                )
                slide_idx += 1
                continue

            # Default: cards_grid or split_column
            card_items = []
            for c in sec_chunks:
                raw = c.get("raw_text", "").strip()
                if not raw:
                    continue
                lines = raw.split("\n")
                first_line = lines[0].lstrip("-* ").strip()
                remaining = "\n".join(lines[1:]).strip() if len(lines) > 1 else ""
                card_items.append(
                    {
                        "title": first_line[:30],
                        "description": remaining[:120] if remaining else first_line,
                    }
                )

            slides.append(
                NarrativeSlide(
                    slide_index=slide_idx,
                    layout_type="cards_grid",
                    title=sec_name,
                    subtitle="核心要素分解与架构细节",
                    cards=card_items[:4] if card_items else [{"title": sec_name, "description": "模块详述"}],
                    bullets=[c.get("raw_text", "")[:60] for c in sec_chunks[:3]],
                    speaker_notes=sec_notes or f"下面深入介绍 {sec_name} 的具体实现细节。",
                    source_chunk_ids=chunk_ids,
                )
            )
            slide_idx += 1

        # Final slide: Conclusion / Q&A
        slides.append(
            NarrativeSlide(
                slide_index=slide_idx,
                layout_type="conclusion",
                title="总结与后续规划",
                subtitle="CONCLUSION & NEXT STEPS",
                bullets=[
                    "严格遵守 IR 契约与 20 点发布门禁",
                    "完成从输入解析到真实渲染的全链路闭环",
                    "感谢聆听，欢迎交流与质询！",
                ],
                speaker_notes="感谢大家的聆听，以上是所有核心内容汇报，欢迎提问。",
                source_chunk_ids=[],
            )
        )

        return NarrativeDeck(
            narrative_id=f"narr_{source_id}",
            source_file_id=source_id,
            title=inferred_title,
            objective="技术方案汇报与工业级交付",
            target_audience="技术决策者与评审委员会",
            slides=slides,
        )

    def _parse_markdown_table(self, raw_table: str) -> Dict[str, Any]:
        """Parses a markdown table string into headers and rows."""
        lines = [line.strip() for line in raw_table.splitlines() if line.strip()]
        if not lines:
            return {"headers": [], "rows": []}

        def split_row(line: str) -> List[str]:
            cells = line.split("|")
            if cells and not cells[0].strip():
                cells = cells[1:]
            if cells and not cells[-1].strip():
                cells = cells[:-1]
            return [c.strip() for c in cells]

        headers = split_row(lines[0])
        rows = []
        for line in lines[1:]:
            if re.match(r"^\|?[-: ]+\|?$", line) or "---" in line:
                continue
            rows.append(split_row(line))

        return {"headers": headers, "rows": rows}
