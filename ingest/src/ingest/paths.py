"""Repo-relative locations, resolved from this file so the working directory doesn't matter."""

import os
from pathlib import Path

INGEST_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = INGEST_ROOT.parent
REPOS_YAML = REPO_ROOT / "content" / "repos.yaml"
# Overridable so several git worktrees can share one set of fetched repos and snapshots.
WORK_DIR = Path(os.environ.get("INGEST_WORK_DIR", INGEST_ROOT / "work"))
OUT_DIR = Path(os.environ.get("INGEST_OUT_DIR", INGEST_ROOT / "out"))
