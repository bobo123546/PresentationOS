"""Command-line interface (CLI) for PresentationOS."""
from __future__ import annotations

import argparse
import json
import sys
import uuid
import os
from pathlib import Path

# Ensure UTF-8 stdout on Windows console if supported
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from core.orchestrator import PresentationOrchestrator
from design.design_tokens import THEMES
from governance.state_reconciler import StateReconciler
from qa.native_verifier import NativePowerPointVerifier


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="pres",
        description="PresentationOS - Industrial AI Presentation Operating System CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Command: compile
    compile_p = subparsers.add_parser("compile", help="Compile document into verified PPTX presentation")
    compile_p.add_argument("input", help="Path to input markdown/docx/table file")
    compile_p.add_argument("--theme", default="tech_dark", choices=list(THEMES.keys()), help="Design theme")
    compile_p.add_argument("--out", default=None, help="Output directory for generated artifacts")
    compile_p.add_argument("--skip-native-qa", action="store_true", help="Skip native PowerPoint verification")

    # Command: qa
    qa_p = subparsers.add_parser("qa", help="Run native PowerPoint COM verification on existing PPTX")
    qa_p.add_argument("pptx", help="Path to PPTX file")
    qa_p.add_argument("--slides", type=int, default=1, help="Expected slide count")

    # Command: audit
    subparsers.add_parser("audit", help="Audit project state and schemas against physical disk")

    # Command: themes
    subparsers.add_parser("themes", help="List available design themes")

    args = parser.parse_args()

    if args.command == "themes":
        print("\nAvailable PresentationOS Themes:")
        for name, theme in THEMES.items():
            print(f"  • {name:<18} (bg: {theme.colors.background}, accent: {theme.colors.accent})")
        return 0

    elif args.command == "audit":
        print("\n[Governance Audit] Auditing PresentationOS repository state...")
        root_dir = BASE_DIR.parent
        report = StateReconciler.audit_workspace(str(root_dir))

        print(f"  Project Version: {report.project_version}")
        print(f"  Current Phase:   {report.current_phase}")
        print(f"  Synchronized:    {'YES' if report.is_synchronized else 'NO'}")

        if report.inconsistencies:
            print("\nFindings & Inconsistencies:")
            for item in report.inconsistencies:
                print(f"  [WARN] {item}")
        else:
            print("  [OK] All claimed schemas and phase artifacts match disk layout.")
        return 0

    elif args.command == "qa":
        pptx_path = Path(args.pptx)
        print(f"\n[QA] Running Native PowerPoint QA on: {pptx_path}...")
        verifier = NativePowerPointVerifier(data_root=Path(os.environ.get("PRES_DATA_DIR", r"D:\PresentationOSData")))
        result = verifier.verify_presentation(
            pptx_path=pptx_path,
            run_id="manual_" + uuid.uuid4().hex,
            expected_slides=args.slides,
        )
        print(f"Status: {result.status.value}")
        print(f"Passed: {result.passed}")
        if result.error_message:
            print(f"Error:  {result.error_message}")
        return 0 if result.passed else 1

    elif args.command == "compile":
        input_path = Path(args.input)
        if not input_path.exists():
            print(f"Error: Input file not found: {input_path}", file=sys.stderr)
            return 1

        print(f"\n=======================================================")
        print(f" PresentationOS Compilation Pipeline")
        print(f" Input:  {input_path}")
        print(f" Theme:  {args.theme}")
        print(f"=======================================================\n")

        orchestrator = PresentationOrchestrator(data_root=Path(os.environ.get("PRES_DATA_DIR", r"D:\PresentationOSData")))
        out_dir = Path(args.out) if args.out else None
        res = orchestrator.compile(
            input_path=input_path,
            theme_name=args.theme,
            output_dir=out_dir,
            run_native_qa=not args.skip_native_qa,
        )

        print(f"[Run ID]            {res.run_id}")
        print(f"[Compilation]       {'PASS' if res.success else 'FAIL'}")
        print(f"[Mechanical QA]     {'PASS' if res.qa_passed else 'FAIL'}")
        print(f"[Native Office QA]  {res.native_status}")
        print(f"[Fact Provenance]   {'PASS' if res.provenance_preserved else 'FAIL'}")
        print(f"[Release Gate]      {'RELEASE_READY (20/20)' if res.gate_passed else 'NOT_READY (' + str(res.gate_details.get('passed_count', 0)) + '/20 passed)'}")
        print(f"[Output PPTX]       {res.pptx_path}")
        print(f"[Evidence Dir]      {res.evidence_dir}")

        if not res.gate_passed:
            print("\n[Audit Notice] Release Gate is NOT_READY (normal for development prototype stage).")
            print("Pending production criteria:")
            for b in res.gate_details.get("blockers", []):
                print(f"  • {b}")

        if res.success:
            print("\n[SUCCESS] Document compiled. Native status: " + res.native_status + "; release remains NOT_READY.\n")
            return 0
        else:
            print("\n[FAILED] Compilation failed QA or validation constraints.\n")
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
