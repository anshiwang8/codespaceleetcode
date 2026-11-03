"""Shallow-fetch a repo at its pinned SHA into a cached working directory."""

import os
import shutil
import stat
import subprocess
from collections.abc import Callable
from pathlib import Path

from ingest.errors import IngestError
from ingest.repos import Repo

# Keep file bytes exactly as committed, whatever the local git config says. Otherwise a Windows
# checkout gets CRLF and its snapshot differs from one built anywhere else.
_GIT_CONFIG = (
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.eol=lf",
    "-c",
    "core.longpaths=true",
    "-c",
    "core.symlinks=false",
)
_RAW_ATTRIBUTES = "* -text -filter -ident -working-tree-encoding\n"


def fetch_repo(repo: Repo, work_dir: Path) -> tuple[Path, bool]:
    """Return the checkout path, and whether it came from the cache."""
    target = work_dir / repo.snapshot_name
    if target.exists():
        _verify_head(target, repo.sha)
        return target, True

    work_dir.mkdir(parents=True, exist_ok=True)
    # Build beside the target and rename, so an interrupted run never looks cached.
    temp = work_dir / f".tmp-{repo.snapshot_name}-{os.getpid()}"
    remove_tree(temp)
    temp.mkdir()
    try:
        _git(temp, "init", "--quiet")
        (temp / ".git" / "info" / "attributes").write_text(_RAW_ATTRIBUTES, encoding="utf-8")
        _git(temp, "remote", "add", "origin", repo.url)
        _git(temp, "fetch", "--quiet", "--depth", "1", "--no-tags", "origin", repo.sha)
        _git(temp, "checkout", "--quiet", "--detach", "FETCH_HEAD")
        _verify_head(temp, repo.sha)
        temp.rename(target)
    except BaseException:
        remove_tree(temp)
        raise
    return target, False


def remove_tree(path: Path) -> None:
    """Delete a directory, including the read-only files git leaves in .git on Windows."""
    if path.exists():
        shutil.rmtree(path, onexc=_make_writable_and_retry)


def _make_writable_and_retry(func: Callable[[str], object], name: str, _: BaseException) -> None:
    os.chmod(name, stat.S_IWRITE)
    func(name)


def _verify_head(checkout: Path, sha: str) -> None:
    head = _git(checkout, "rev-parse", "HEAD").strip()
    if head != sha:
        raise IngestError(f"{checkout} is at {head}, expected {sha}. Delete it and run again.")


def _git(cwd: Path, *args: str) -> str:
    git = shutil.which("git")
    if git is None:
        raise IngestError(
            "git was not found on PATH. Install it from https://git-scm.com/downloads"
        )
    result = subprocess.run(
        [git, *_GIT_CONFIG, *args], cwd=cwd, capture_output=True, encoding="utf-8", check=False
    )
    if result.returncode != 0:
        raise IngestError(f"git {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout
