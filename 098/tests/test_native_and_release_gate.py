import os
import sys
import tempfile
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.resolved_scene import ResolvedScene, ResolvedSlide, ResolvedElement, BoundingBox
from core.content_provenance import ContentProvenanceTracker
from qa.native_qa_contract import NativeQAContract, NativeVerificationTier
from tools.evidence_manifest import EvidenceManifestBuilder
from tools.release_gate import ReleaseGateVerifier


def test_native_qa_contract_handles_missing_office():
    # If Office is unavailable, it must report OFFICE_UNAVAILABLE and not allow release
    res = NativeQAContract.evaluate_run(
        has_office=False,
        com_open_success=False,
        com_save_reopen_success=False,
        pdf_generated=False,
        readback_match=False,
        editability_intact=False
    )
    assert res.is_release_ready is False
    assert NativeVerificationTier.OFFICE_UNAVAILABLE in res.failed_tiers
    assert NativeVerificationTier.NATIVE_OPEN_PASS not in res.passed_tiers


def test_native_qa_contract_complete_success():
    res = NativeQAContract.evaluate_run(
        has_office=True,
        com_open_success=True,
        com_save_reopen_success=True,
        pdf_generated=True,
        readback_match=True,
        editability_intact=True,
        package_valid=True,
        schema_valid=True
    )
    assert res.is_release_ready is True
    assert len(res.failed_tiers) == 0
    assert NativeVerificationTier.PDF_EXPORT_PASS in res.passed_tiers
    assert NativeVerificationTier.EDITABILITY_PASS in res.passed_tiers


def test_content_provenance_fact_preservation():
    source_text = "In 2026, Q3 profits reached $50M across 1,200 enterprise clients."
    facts = ContentProvenanceTracker.extract_facts_from_text(source_text, section_id="sec_fin")
    assert len(facts) >= 3

    # Case A: Preserved deck
    scene_ok = ResolvedScene(deck_id="d1")
    slide = ResolvedSlide(slide_id="s1", slide_index=1)
    slide.elements.append(ResolvedElement(
        element_id="el_summary",
        kind="text",
        box=BoundingBox(50, 50, 500, 200),
        content="Our 2026 milestone: delivered $50M profits serving 1,200 enterprise clients."
    ))
    scene_ok.slides.append(slide)

    preserved, missing = ContentProvenanceTracker.audit_scene_facts(facts, scene_ok)
    assert len(missing) == 0
    assert len(preserved) >= 3

    # Case B: Altered/missing numbers ($50M dropped)
    scene_bad = ResolvedScene(deck_id="d2")
    slide_bad = ResolvedSlide(slide_id="s2", slide_index=1)
    slide_bad.elements.append(ResolvedElement(
        element_id="el_vague",
        kind="text",
        box=BoundingBox(50, 50, 500, 200),
        content="Our 2026 milestone: delivered massive profits."
    ))
    scene_bad.slides.append(slide_bad)

    preserved_b, missing_b = ContentProvenanceTracker.audit_scene_facts(facts, scene_bad)
    assert any(f.value == "$50M" for f in missing_b)


def test_evidence_manifest_generation():
    with tempfile.TemporaryDirectory() as temp_dir:
        test_file = os.path.join(temp_dir, "output.pptx")
        with open(test_file, "w") as f:
            f.write("mock pptx content")

        manifest = EvidenceManifestBuilder.build_manifest(
            task_id="TASK-0012",
            commit_hash="f68c9fd",
            command="node vertical-slice/markdown-to-deck.mjs",
            exit_code=0,
            inputs_data={"source": "sample.md"},
            status="PASS",
            artifact_paths=[test_file]
        )

        saved_path = manifest.save(temp_dir)
        assert os.path.exists(saved_path)
        assert manifest.inputs_hash != ""
        assert manifest.outputs_hash != ""
        assert len(manifest.artifacts) == 1
        assert manifest.status == "PASS"


def test_release_gate_20_point_enforcement():
    # 19 passing, 1 failing -> Rejected
    status_incomplete = {i: True for i in range(1, 20)}
    status_incomplete[20] = False  # Gate 20 failed

    audit_fail = ReleaseGateVerifier.evaluate_release(status_incomplete)
    assert audit_fail.is_release_ready is False
    assert audit_fail.passed_count == 19
    assert audit_fail.total_count == 20

    # 20/20 passing -> Certified
    status_complete = {i: True for i in range(1, 21)}
    audit_pass = ReleaseGateVerifier.evaluate_release(status_complete)
    assert audit_pass.is_release_ready is True
    assert audit_pass.passed_count == 20
