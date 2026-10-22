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
        chunks = source_ir.get("chunks", [])
        title = deck_title or next((c["raw_text"] for c in chunks if c.get("heading_level") == 1), source_ir.get("file_name", "Presentation"))
        slides = [NarrativeSlide(slide_index=1, layout_type="title_slide", title=title, subtitle="Developer preview")]
        agenda = [c["raw_text"] for c in chunks if c.get("content_type") == "heading" and c.get("heading_level") != 1]
        for i in range(0, len(agenda), 4):
            slides.append(NarrativeSlide(slide_index=len(slides)+1, layout_type="agenda", title="Contents", bullets=agenda[i:i+4]))
        section = title
        notes = "\n".join(c["raw_text"] for c in chunks if c.get("content_type") == "speaker_note")
        for chunk in chunks:
            kind = chunk.get("content_type")
            if kind == "heading":
                section = chunk["raw_text"]
                continue
            if kind == "speaker_note":
                continue
            cid = chunk["chunk_id"]
            raw = chunk.get("raw_text", "")
            if kind == "table":
                table = self._parse_markdown_table(raw)
                width=max([len(table["headers"]), *(len(row) for row in table["rows"])], default=0)
                table["headers"] += [""]*(width-len(table["headers"]))
                for i in range(0,max(1,len(table["rows"])),6):
                    slides.append(NarrativeSlide(slide_index=len(slides)+1, layout_type="data_table", title=section, table_data={"headers":table["headers"],"rows":table["rows"][i:i+6]},source_chunk_ids=[cid],speaker_notes=notes))
                continue
            # Every fragment is retained in order. Wrap rather than crop long lines.
            facts=[f for f in source_ir.get("facts",[]) if f.get("chunk_id")==cid]
            for i in range(0,len(raw),350):
                part=raw[i:i+350]
                wrapped="\n".join(part[j:j+48] for j in range(0,len(part),48))
                if len(facts)>=2 and i==0:
                    slides.append(NarrativeSlide(slide_index=len(slides)+1,layout_type="big_metric",title=section,metrics=[{"value":f["literal_value"],"label":"Source metric"} for f in facts[:4]],bullets=[wrapped],source_chunk_ids=[cid],speaker_notes=notes))
                else:
                    slides.append(NarrativeSlide(slide_index=len(slides)+1,layout_type="cards_grid",title=section,cards=[{"title":"Source content","description":wrapped}],source_chunk_ids=[cid],speaker_notes=notes))
        slides.append(NarrativeSlide(slide_index=len(slides)+1,layout_type="conclusion",title="End",bullets=["End of source document"],speaker_notes=notes))
        return NarrativeDeck(narrative_id="narr_"+source_ir.get("source_id","unknown"),source_file_id=source_ir.get("source_id","unknown"),title=title,objective="Source-preserving developer preview",target_audience="Developers",slides=slides)

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
            if all(re.fullmatch(r":?-{3,}:?", cell) for cell in split_row(line)):
                continue
            rows.append(split_row(line))

        return {"headers": headers, "rows": rows}
