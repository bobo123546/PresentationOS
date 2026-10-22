"""
Content Provenance and Fact Preservation Tracker.
Audits extracted literals and source text fragments in generated slide content.
String-level checks do not establish general semantic correctness.
"""
from __future__ import annotations
import re
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass, field
from .resolved_scene import ResolvedScene


@dataclass
class PreservedFact:
    fact_type: str  # number, unit, date, condition, quote
    value: str
    source_section_id: str
    verified_in_deck: bool = False


class ContentProvenanceTracker:
    """
    Scans source text to establish grounded ground-truth facts,
    then audits the resolved presentation to prevent semantic drift.
    """

    # Common patterns for numbers with currency/units, percentages, dates
    NUMBER_PATTERN = re.compile(r"(\$|￥|€)?(\d+(\.\d+)?)\s*(%|k|M|B|G|万|亿|元|台|次|人|个)?", re.IGNORECASE)
    DATE_PATTERN = re.compile(r"\b(20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{4}年)\b")

    @classmethod
    def extract_facts_from_text(cls, text: str, section_id: str = "sec_0") -> List[PreservedFact]:
        facts = []
        # Extract dates
        for match in cls.DATE_PATTERN.finditer(text):
            facts.append(PreservedFact(
                fact_type="date",
                value=match.group(0),
                source_section_id=section_id
            ))

        # Extract numerical quantities
        for match in cls.NUMBER_PATTERN.finditer(text):
            val = match.group(0).strip()
            if len(val) > 1 and any(ch.isdigit() for ch in val):
                facts.append(PreservedFact(
                    fact_type="number",
                    value=val,
                    source_section_id=section_id
                ))

        return facts

    @classmethod
    def audit_scene_facts(
        cls,
        source_facts: List[PreservedFact],
        scene: ResolvedScene
    ) -> Tuple[List[PreservedFact], List[PreservedFact]]:
        """
        Verify each source fact against the slide content in ResolvedScene.
        Returns:
            (preserved_facts, missing_or_altered_facts)
        """
        all_deck_text = []
        for s in scene.slides:
            for el in s.elements:
                if el.kind == "text" and isinstance(el.content, str):
                    all_deck_text.append(el.content)

        combined_deck_text = " ".join(all_deck_text)

        preserved = []
        missing = []

        for fact in source_facts:
            # Check presence
            if fact.value in combined_deck_text:
                fact.verified_in_deck = True
                preserved.append(fact)
            else:
                fact.verified_in_deck = False
                missing.append(fact)

        return preserved, missing

    @classmethod
    def audit_deck(cls, source_ir: Dict[str, Any], rendered_deck_text: str, chunk_texts=None) -> Dict[str, Any]:
        """Convenience method auditing facts from SourceIR against full rendered deck text."""
        source_facts = source_ir.get("facts", [])
        total = len(source_facts)
        preserved_count = 0
        missing = []

        for f in source_facts:
            val = f.get("literal_value", "")
            if val and val in rendered_deck_text:
                preserved_count += 1
            else:
                missing.append(val)

        # A numeric-only sample can pass while prose is lost. Check every source
        # chunk too, ignoring presentation whitespace and Markdown table separators.
        normalized = re.sub(r"\s+", "", rendered_deck_text)
        missing_chunks=[]
        for chunk in source_ir.get("chunks", []):
            if chunk.get("content_type") == "speaker_note":
                continue
            raw=chunk.get("raw_text", "")
            candidates = chunk_texts.get(chunk.get('chunk_id'), []) if chunk_texts is not None else [rendered_deck_text]
            candidate_text = re.sub(r"\s+", "", "".join(candidates))
            if chunk.get('content_type') == 'heading':
                candidate_text = normalized
            if chunk.get("content_type") == "table":
                values=[cell.strip() for line in raw.splitlines() for cell in line.strip().strip("|").split("|") if cell.strip() and not re.fullmatch(r":?-{3,}:?",cell.strip())]
                from collections import Counter
                expected = Counter(values)
                actual = Counter(candidates)
                present = all(actual[value] >= count for value, count in expected.items()) if chunk_texts is not None else all(re.sub(r"\s+","",value) in normalized for value in values)
            else:
                # Long chunks can span slides; match complete source lines in
                # small fragments without permitting any missing characters.
                clean=re.sub(r"\s+","",raw)
                present=clean in candidate_text
            if not present: missing_chunks.append(chunk.get("chunk_id"))
        preserved_ratio = preserved_count / max(1, total)
        return {
            "total_facts": total,
            "preserved_facts": preserved_count,
            "missing_facts": missing,
            "missing_source_chunks": missing_chunks,
            "preservation_ratio": preserved_ratio,
            "preserved": not missing_chunks and len(missing) == 0 and (preserved_ratio == 1.0 or total == 0),
        }


# Alias for backward and forward compatibility
ContentProvenance = ContentProvenanceTracker
