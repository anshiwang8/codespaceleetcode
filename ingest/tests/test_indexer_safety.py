"""A fetched repo must not be able to run code during indexing."""

import contextlib
import os
import subprocess
import sys
from pathlib import Path

import pytest

from ingest.errors import IngestError
from ingest.indexer import run_tool, stage_files


def test_windows_executables_are_not_staged(tmp_path: Path) -> None:
    checkout = tmp_path / "checkout"
    checkout.mkdir()
    for name in ("node.cmd", "python.BAT", "tool.exe", "app.com", "run.ps1", "index.js"):
        (checkout / name).write_text("x", encoding="utf-8")
    stage = tmp_path / "stage"
    stage_files(checkout, [path.name for path in checkout.iterdir()], stage)
    assert [path.name for path in stage.iterdir()] == ["index.js"]


@pytest.mark.skipif(sys.platform != "win32", reason="cmd.exe's lookup order is Windows-only")
def test_a_shim_does_not_run_node_from_the_working_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    marker = repo / "ran.txt"
    (repo / "node.cmd").write_text("@echo ran> ran.txt\r\n", encoding="utf-8")
    shim = tmp_path / "indexer.cmd"
    shim.write_text("@node --version\r\n", encoding="utf-8")
    monkeypatch.delenv("NoDefaultCurrentDirectoryInExePath", raising=False)

    # Without the protection the repo's file runs, so this test can really catch a regression.
    subprocess.run([str(shim)], cwd=repo, capture_output=True, check=False)
    assert marker.exists()
    marker.unlink()

    run_tool("indexer", str(shim), cwd=repo)
    assert not marker.exists()


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX execute bits")
def test_staged_files_are_never_executable(tmp_path: Path) -> None:
    # On macOS and Linux this is what keeps a repo's own `node` from running during indexing.
    checkout = tmp_path / "checkout"
    checkout.mkdir()
    for name in ("node", "python3", "bin/tool"):
        path = checkout / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("#!/bin/sh\n", encoding="utf-8")
        path.chmod(0o755)
    stage = tmp_path / "stage"
    stage_files(checkout, ["node", "python3", "bin/tool"], stage)
    for name in ("node", "python3", "bin/tool"):
        assert (stage / name).stat().st_mode & 0o111 == 0


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX PATH lookup; Windows is covered above")
def test_a_relative_path_entry_does_not_reach_the_working_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    marker = repo / "ran.txt"
    node = repo / "node"
    node.write_text("#!/bin/sh\necho ran > ran.txt\n", encoding="utf-8")
    node.chmod(0o755)
    shim = tmp_path / "indexer"
    shim.write_text("#!/bin/sh\nnode --version\n", encoding="utf-8")
    shim.chmod(0o755)
    # An empty PATH entry means the current directory, as does `.`.
    for path in (f":{os.environ['PATH']}", f".:{os.environ['PATH']}"):
        monkeypatch.setenv("PATH", path)

        # Without the protection the repo's file runs, so this test can really catch a regression.
        subprocess.run([str(shim)], cwd=repo, capture_output=True, check=False)
        assert marker.exists()
        marker.unlink()

        with contextlib.suppress(IngestError):  # Fine if this machine has no node at all.
            run_tool("indexer", str(shim), cwd=repo)
        assert not marker.exists()
