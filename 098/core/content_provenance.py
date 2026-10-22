"""
Content Provenance and Fact Preservation Tracker.
Ensures that key numbers, units, dates, conditions, and quotes
from SourceIR are accurately preserved in the generated slides without hallucination.
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
    def audit_deck(cls, source_ir: Dict[str, Any], rendered_deck_text: str) -> Dict[str, Any]:
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

        preserved_ratio = preserved_count / max(1, total)
        return {
            "total_facts": total,
            "preserved_facts": preserved_count,
            "missing_facts": missing,
            "preservation_ratio": preserved_ratio,
            "preserved": len(missing) == 0 and (preserved_ratio == 1.0 or total == 0),
        }


# Alias for backward and forward compatibility
ContentProvenance = ContentProvenanceTracker
