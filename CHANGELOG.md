# Changelog

## 0.1.2-alpha — 2026-10-23

- Preserve every H1 heading as a visible slide section and retain table rows that resemble a Markdown separator after the initial delimiter.
- Delegate the legacy Markdown compiler to the validated CLI pipeline, protecting source files, existing PPTX files and reports.
- Reject XML-forbidden characters in tables and other rendered text while preserving valid Unicode.
- Validate Native input/output boundaries before Office activation, publish PDFs without overwrite, and compare text with slide/shape boundaries intact.
- Record Native launch, timeout, corrupt-result and cleanup failures; reject evidence path traversal and linked parents.
- Update the fixed image-size and Pillow pins, NuGet test dependencies and GitHub Actions. Add Node and NuGet high-severity audit gates and a CLI/product version consistency check.

This remains a CLI developer preview. Full Native font/visual/OpenXML certification, desktop UI, installer, clean-machine acceptance and production model integration remain open. See [validation notes](docs/验证记录.md) for the checks actually performed.
