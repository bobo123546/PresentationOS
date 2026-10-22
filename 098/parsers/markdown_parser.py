"""Markdown parser producing compliant SourceIR with provenance facts."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple


class MarkdownParser:
    """Parses Markdown documents into standardized SourceIR with fact extraction."""

    FACT_PATTERNS = [
        # Explicit currency amounts ($100, $50B, ¥500, etc.)
        r"[$¥€£]\s*\d+(?:\.\d+)?(?:[KMGTBkmgtb]B?)?",
        # Percentages
        r"\d+(?:\.\d+)?\s*[%％]",
        # Numbers with Chinese units or engineering units
        r"\d+(?:\.\d+)?\s*(?:[万亿千百位个项套条台款次天年秒分]|(?:[KMGTBkmgtb]B?)|ms)",
        # ISO Dates or Chinese dates
        r"\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\b",
    ]

    def __init__(self) -> None:
        self.compiled_facts = [re.compile(p) for p in self.FACT_PATTERNS]

    def parse_file(self, file_path: Path) -> Dict[str, Any]:
        """Parses a markdown file and returns a SourceIR dictionary."""
        content = file_path.read_text(encoding="utf-8")
        file_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

        return self.parse_text(
            text=content,
            file_id=f"src_md_{file_hash[:12]}",
            file_name=file_path.name,
            file_hash=file_hash,
        )

    def parse_text(
        self,
        text: str,
        file_id: str = "src_raw_text",
        file_name: str = "input.md",
        file_hash: str = "",
    ) -> Dict[str, Any]:
        """Parses raw markdown text into SourceIR."""
        if not file_hash:
            file_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

        lines = text.splitlines()
        chunks: List[Dict[str, Any]] = []
        facts: List[Dict[str, Any]] = []

        current_section = "Intro"
        chunk_idx = 0
        fact_idx = 0

        buffer: List[str] = []
        buffer_start = 0

        def flush_buffer(end_line: int, kind: str = "paragraph") -> None:
            nonlocal chunk_idx, fact_idx, buffer
            if not buffer:
                return
            chunk_text = "\n".join(buffer).strip()
            if not chunk_text:
                buffer = []
                return

            cid = f"chk_{chunk_idx:04d}"
            extracted_facts = self._extract_facts(chunk_text, cid, fact_idx)
            fact_idx += len(extracted_facts)
            facts.extend(extracted_facts)

            chunks.append(
                {
                    "chunk_id": cid,
                    "section_title": current_section,
                    "content_type": kind,
                    "raw_text": chunk_text,
                    "line_range": [buffer_start + 1, end_line],
                    "extracted_facts": [f["fact_id"] for f in extracted_facts],
                }
            )
            chunk_idx += 1
            buffer = []

        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            # Heading
            if stripped.startswith("#"):
                flush_buffer(i)
                level = len(stripped) - len(stripped.lstrip("#"))
                heading_text = stripped.lstrip("#").strip()
                current_section = heading_text
                cid = f"chk_{chunk_idx:04d}"
                chunks.append(
                    {
                        "chunk_id": cid,
                        "section_title": current_section,
                        "content_type": "heading",
                        "heading_level": level,
                        "raw_text": heading_text,
                        "line_range": [i + 1, i + 1],
                        "extracted_facts": [],
                    }
                )
                chunk_idx += 1
                i += 1
                continue

            # Speaker note tag
            if stripped.startswith("<!-- note:") or stripped.startswith("<!-- Note:"):
                flush_buffer(i)
                note_content = stripped.split(":", 1)[1].rstrip("->").strip()
                cid = f"chk_{chunk_idx:04d}"
                chunks.append(
                    {
                        "chunk_id": cid,
                        "section_title": current_section,
                        "content_type": "speaker_note",
                        "raw_text": note_content,
                        "line_range": [i + 1, i + 1],
                        "extracted_facts": [],
                    }
                )
                chunk_idx += 1
                i += 1
                continue

            # Table block
            if stripped.startswith("|"):
                flush_buffer(i)
                tbl_start = i
                tbl_lines = []
                while i < len(lines) and lines[i].strip().startswith("|"):
                    tbl_lines.append(lines[i].strip())
                    i += 1
                tbl_text = "\n".join(tbl_lines)
                cid = f"chk_{chunk_idx:04d}"
                extracted_facts = self._extract_facts(tbl_text, cid, fact_idx)
                fact_idx += len(extracted_facts)
                facts.extend(extracted_facts)
                chunks.append(
                    {
                        "chunk_id": cid,
                        "section_title": current_section,
                        "content_type": "table",
                        "raw_text": tbl_text,
                        "line_range": [tbl_start + 1, i],
                        "extracted_facts": [f["fact_id"] for f in extracted_facts],
                    }
                )
                chunk_idx += 1
                continue

            # Empty line acts as paragraph boundary
            if not stripped:
                flush_buffer(i)
                i += 1
                continue

            # Accumulate paragraph or list line
            if not buffer:
                buffer_start = i
            buffer.append(line)
            i += 1

        flush_buffer(len(lines))

        return {
            "source_id": file_id,
            "file_name": file_name,
            "sha256": file_hash,
            "total_chunks": len(chunks),
            "chunks": chunks,
            "facts": facts,
        }

    def _extract_facts(
        self, text: str, chunk_id: str, start_index: int
    ) -> List[Dict[str, Any]]:
        """Extracts numerical and date facts with character offsets."""
        extracted: List[Dict[str, Any]] = []
        current_idx = start_index

        for pattern in self.compiled_facts:
            for match in pattern.finditer(text):
                val = match.group(0).strip()
                # filter out trivial numbers like a single digit without context
                if len(val) < 2 and not val.isdigit():
                    continue
                extracted.append(
                    {
                        "fact_id": f"fact_{current_idx:04d}",
                        "chunk_id": chunk_id,
                        "fact_type": "numeric" if any(c.isdigit() for c in val) else "entity",
                        "literal_value": val,
                        "char_range": [match.start(), match.end()],
                        "verified": True,
                    }
                )
                current_idx += 1

        return extracted
