"""Validate the experimental Python contracts at actual pipeline boundaries."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

def validate_ir(name, data):
    schema=json.loads((Path(__file__).resolve().parents[1]/"schemas"/f"{name}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
