"""Run scip-typescript over a staged copy of the filtered files."""

import shutil
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from ingest.errors import IngestError
from ingest.fetch import remove_tree

SCIP_TYPESCRIPT_VERSION = "0.6.0"
SUPPORTED_LANGUAGES = frozenset({"javascript", "typescript"})
INSTALL_HELP = (
    "scip-typescript was not found on PATH. Install it with:\n"
    f"  npm install -g @sourcegraph/scip-typescript@{SCIP_TYPESCRIPT_VERSION}\n"
    "It needs Node 22 or 24. Open a new terminal afterward, then run this command again."
)


@dataclass(frozen=True)
class IndexResult:
    index_path: Path
    indexer_version: str


def stage_files(checkout: Path, kept: Iterable[str], stage_dir: Path) -> None:
    """Copy kept files to a clean dir, so the indexer sees only what the snapshot contains."""
    remove_tree(stage_dir)
    for rel_path in kept:
        destination = stage_dir / rel_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(checkout / rel_path, destination)


def run_indexer(language: str, stage_dir: Path) -> IndexResult:
    if language not in SUPPORTED_LANGUAGES:
        raise IngestError(f"No SCIP indexer is set up for language '{language}' yet.")
    executable = shutil.which("scip-typescript")
    if executable is None:
        raise IngestError(INSTALL_HELP)

    version = _run(executable, "--version", cwd=stage_dir).strip()
    # --infer-tsconfig only writes a tsconfig.json when the repo has none. It lands in the stage
    # dir, which is why the snapshot's files/ are never written from here.
    _run(
        executable,
        "index",
        "--cwd",
        str(stage_dir),
        "--output",
        "index.scip",
        "--infer-tsconfig",
        "--no-progress-bar",
        cwd=stage_dir,
    )
    index_path = stage_dir / "index.scip"
    if not index_path.is_file():
        raise IngestError(f"scip-typescript exited cleanly but wrote no file at {index_path}.")
    return IndexResult(index_path=index_path, indexer_version=version)


def _run(executable: str, *args: str, cwd: Path) -> str:
    result = subprocess.run(
        [executable, *args], cwd=cwd, capture_output=True, encoding="utf-8", check=False
    )
    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        raise IngestError(f"scip-typescript {' '.join(args)} failed:\n{details}")
    return result.stdout
