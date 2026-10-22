# Python prototype (098)

This is an independent experimental implementation, retained for comparison with the TypeScript/.NET main runtime. Its SourceIR and canvas contracts are local to this prototype.

The pipeline preserves source text and table rows through pagination, validates runtime boundaries and checks generated PPTX text by source chunk. Numeric string matching is a regression aid, not a guarantee of semantic correctness. Unknown renderer elements fail explicitly.

Install `requirements.txt`, then run `python -B -m pytest 098/tests -q -p no:cacheprovider` from the repository root. Portable tests do not launch PowerPoint. Keep native fault diagnostics enabled.

Optional Office checks run in a timed child process and record real save/reopen, edit/readback, PDF, PNG and process observations. Full visual fidelity, font substitution and OpenXML schema validation remain unverified. The prototype and platform remain **NOT_READY** for production release.

Existing historical evidence may describe older, incomplete checks. Use new isolated run directories and the command, exit code, source snapshot and artifacts from the same run when evaluating behavior.
