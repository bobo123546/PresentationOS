"""End-to-end integration tests for PresentationOS Orchestrator."""
from pathlib import Path
from core.orchestrator import PresentationOrchestrator


def test_full_pipeline_compilation(tmp_path):
    example_path = Path(__file__).resolve().parent.parent / "examples" / "enterprise_architecture.md"
    assert example_path.exists(), f"Example markdown missing: {example_path}"

    data_root = tmp_path / "PresentationOSData"
    orchestrator = PresentationOrchestrator(data_root=data_root)

    # Compile with native QA enabled
    result = orchestrator.compile(
        input_path=example_path,
        theme_name="tech_dark",
        output_dir=tmp_path / "output",
        run_native_qa=True,
    )

    assert result.pptx_path.exists()
    assert result.pptx_path.stat().st_size > 5000

    # Verify Mechanical QA passed
    assert result.qa_passed is True

    # Verify Fact Provenance was preserved
    assert result.provenance_preserved is True

    # Verify Evidence Manifest generated
    manifest_file = result.evidence_dir / "evidence_manifest.json"
    assert manifest_file.exists()

    # Verify 20-point Release Gate Decision honestly reports NOT_READY for prototype stage
    assert result.success is True
    assert result.gate_passed is False
    assert result.gate_details["passed"] is False
    assert len(result.gate_details.get("blockers", [])) > 0
