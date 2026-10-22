"""Registry of source parsers routing to the appropriate parser."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Union

from .docx_parser import DocxParser
from .markdown_parser import MarkdownParser
from .tabular_parser import TabularParser


def parse_file(file_path: Union[str, Path]) -> Dict[str, Any]:
    """Inspects file extension and invokes corresponding parser to produce SourceIR."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Input source file does not exist: {path}")

    ext = path.suffix.lower()

    if ext in [".md", ".markdown", ".txt"]:
        parser = MarkdownParser()
        return parser.parse_file(path)
    elif ext == ".docx":
        parser = DocxParser()
        return parser.parse_file(path)
    elif ext in [".xlsx", ".csv", ".tsv"]:
        parser = TabularParser()
        return parser.parse_file(path)
    else:
        # Fallback to text parsing
        parser = MarkdownParser()
        return parser.parse_file(path)
