"""Repo-relative locations, resolved from this file so the working directory doesn't matter."""

from pathlib import Path

INGEST_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = INGEST_ROOT.parent
REPOS_YAML = REPO_ROOT / "content" / "repos.yaml"
WORK_DIR = INGEST_ROOT / "work"
OUT_DIR = INGEST_ROOT / "out"
