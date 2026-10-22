"""Tabular parser for CSV, TSV and Excel (.xlsx) files into SourceIR."""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from typing import Any, Dict, List

import openpyxl
from .markdown_parser import MarkdownParser


class TabularParser:
    """Parses tabular files (CSV, TSV, XLSX) into structured SourceIR."""

    def __init__(self) -> None:
        self.md_parser = MarkdownParser()

    def parse_file(self, file_path: Path) -> Dict[str, Any]:
        """Parses tabular data and formats table chunks and numeric facts."""
        file_bytes = file_path.read_bytes()
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        ext = file_path.suffix.lower()

        rows: List[List[str]] = []
        if ext == ".xlsx":
            wb = openpyxl.load_workbook(str(file_path), data_only=True)
            sheet = wb.active
            if sheet is not None:
                for row in sheet.iter_rows(values_only=True):
                    rows.append([str(c) if c is not None else "" for c in row])
        else:
            delimiter = "\t" if ext == ".tsv" else ","
            content = file_bytes.decode("utf-8", errors="replace")
            reader = csv.reader(content.splitlines(), delimiter=delimiter)
            rows = [list(r) for r in reader]

        chunks: List[Dict[str, Any]] = []
        facts: List[Dict[str, Any]] = []
        chunk_idx = 0
        fact_idx = 0

        if rows:
            headers = rows[0]
            cid = f"chk_{chunk_idx:04d}"
            # Render markdown table representation
            md_table_rows = [" | ".join(headers), " | ".join(["---"] * len(headers))]
            for r in rows[1:]:
                md_table_rows.append(" | ".join(r))
            table_text = "\n".join(md_table_rows)

            extracted_facts = self.md_parser._extract_facts(table_text, cid, fact_idx)
            fact_idx += len(extracted_facts)
            facts.extend(extracted_facts)

            chunks.append(
                {
                    "chunk_id": cid,
                    "section_title": file_path.stem,
                    "content_type": "table",
                    "raw_text": table_text,
                    "line_range": [1, len(rows)],
                    "extracted_facts": [f["fact_id"] for f in extracted_facts],
                }
            )

        return {
            "source_id": f"src_table_{file_hash[:12]}",
            "file_name": file_path.name,
            "sha256": file_hash,
            "total_chunks": len(chunks),
            "chunks": chunks,
            "facts": facts,
        }
