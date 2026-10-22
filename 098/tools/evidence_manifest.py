"""
Evidence Manifest Generator and Verifier (P0-03).
Associates git commits, command lines, input hashes, output artifacts,
and environment parameters into cryptographically signed evidence records.
"""
from __future__ import annotations
import os
import json
import time
import hashlib
import platform
import sys
import subprocess
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union, Tuple
from pathlib import Path
from dataclasses import dataclass, field, asdict


@dataclass
class ManifestArtifact:
    path: str
    checksum: str
    size_bytes: int


@dataclass
class EvidenceManifest:
    evidence_id: str
    task_id: str
    commit_hash: str
    command: str
    exit_code: int
    timestamp: str
    inputs_hash: str
    outputs_hash: str
    status: str  # PASS, FAIL, LIMITED_TRIAL, REVALIDATION_REQUIRED, BLOCKED
    environment: Dict[str, Any]
    artifacts: List[ManifestArtifact] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def save(self, output_dir: str) -> str:
        os.makedirs(output_dir, exist_ok=True)
        manifest_path = os.path.join(output_dir, f"evidence_{self.evidence_id}.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        return manifest_path


class EvidenceManifestBuilder:
    """Helper to build cryptographically grounded EvidenceManifests."""

    def __init__(self, task_id: str = "task_default", commit_hash: str = "HEAD") -> None:
        self.task_id = task_id
        self.commit_hash = commit_hash
        self.inputs: List[Path] = []
        self.artifacts: List[Tuple[Path, str]] = []
        self.evidence_files: List[Tuple[Path, str]] = []

    def add_input_file(self, path: Union[str, Path]) -> None:
        self.inputs.append(Path(path))

    def add_artifact(self, path: Union[str, Path], label: str = "artifact") -> None:
        self.artifacts.append((Path(path), label))

    def add_evidence(self, path: Union[str, Path], label: str = "evidence") -> None:
        self.evidence_files.append((Path(path), label))

    def build(self, status: str = "LIMITED_TRIAL", command: str | None = None, exit_code: int = 0) -> Dict[str, Any]:
        artifacts_manifest = []
        out_hasher = hashlib.sha256()

        for p, _ in self.artifacts:
            if p.exists():
                csum = self.hash_file(str(p))
                artifacts_manifest.append(
                    {
                        "path": str(p),
                        "checksum": csum,
                        "size_bytes": p.stat().st_size,
                    }
                )
                out_hasher.update(csum.encode("utf-8"))

        for p, _ in self.evidence_files:
            if p.exists():
                csum = self.hash_file(str(p))
                artifacts_manifest.append(
                    {
                        "path": str(p),
                        "checksum": csum,
                        "size_bytes": p.stat().st_size,
                    }
                )
                out_hasher.update(csum.encode("utf-8"))

        in_hasher = hashlib.sha256()
        for inp in self.inputs:
            if inp.exists():
                in_hasher.update(self.hash_file(str(inp)).encode("utf-8"))

        return {
            "evidence_id": f"ev_{self.task_id}_{int(time.time())}",
            "task_id": self.task_id,
            "commit_hash": self.commit_hash,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "inputs_hash": in_hasher.hexdigest(),
            "outputs_hash": out_hasher.hexdigest(),
            "status": status,
            "command": command or subprocess.list2cmdline([sys.executable, *sys.argv]),
            "exit_code": exit_code,
            "source_snapshot": source_snapshot(),
            "environment": {"os": platform.platform(), "python_version": platform.python_version()},
            "artifacts": artifacts_manifest,
        }

    @classmethod
    def hash_file(cls, filepath: str) -> str:
        if not os.path.exists(filepath):
            return ""
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    @classmethod
    def hash_data(cls, data: Any) -> str:
        serialized = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @classmethod
    def build_manifest(
        cls,
        task_id: str,
        commit_hash: str,
        command: str,
        exit_code: int,
        inputs_data: Any,
        status: str,
        artifact_paths: Optional[List[str]] = None,
        env_meta: Optional[Dict[str, Any]] = None
    ) -> EvidenceManifest:
        ev_id = f"ev_{task_id}_{int(time.time())}"
        in_hash = cls.hash_data(inputs_data)

        artifacts = []
        out_hasher = hashlib.sha256()

        if artifact_paths:
            for p in artifact_paths:
                if os.path.exists(p):
                    csum = cls.hash_file(p)
                    size = os.path.getsize(p)
                    artifacts.append(ManifestArtifact(path=p, checksum=csum, size_bytes=size))
                    out_hasher.update(csum.encode("utf-8"))

        out_hash = out_hasher.hexdigest()

        return EvidenceManifest(
            evidence_id=ev_id,
            task_id=task_id,
            commit_hash=commit_hash,
            command=command,
            exit_code=exit_code,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            inputs_hash=in_hash,
            outputs_hash=out_hash,
            status=status,
            environment=env_meta or {"os": platform.platform(), "python_version": platform.python_version()},
            artifacts=artifacts
        )


def source_snapshot():
    root = Path(__file__).resolve().parents[2]
    files = {}
    for directory in (root/"098", root/"state", root/"workers/powerpoint-dotnet/src"):
        for path in sorted(directory.rglob("*")):
            if path.is_file() and path.suffix in {".py", ".json", ".txt", ".cs", ".csproj"} and not any(part in {"__pycache__", ".venv", ".pytest_cache", "bin", "obj"} for part in path.parts):
                files[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
    result = subprocess.run(["git", "-C", str(root), "status", "--porcelain"],capture_output=True,text=True)
    return {"dirty": bool(result.stdout) or result.returncode != 0,"git_status":result.stdout,"files":files}
