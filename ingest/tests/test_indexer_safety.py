"""A fetched repo must not be able to run code during indexing."""

import subprocess
import sys
from pathlib import Path

import pytest

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
