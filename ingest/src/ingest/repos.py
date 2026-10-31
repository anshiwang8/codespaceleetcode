"""Load and check content/repos.yaml."""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import yaml

from ingest.errors import IngestError

_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_REQUIRED_FIELDS = ("slug", "url", "sha", "language", "license")


@dataclass(frozen=True)
class Repo:
    slug: str
    url: str
    sha: str
    language: str
    license: str

    @property
    def snapshot_name(self) -> str:
        return f"{self.slug}@{self.sha}"


def load_repos(path: Path) -> list[Repo]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise IngestError(f"{path} must contain a list of repos.")
    return [_parse_entry(entry, path) for entry in cast(list[object], raw)]


def find_repo(path: Path, slug: str) -> Repo:
    repos = load_repos(path)
    for repo in repos:
        if repo.slug == slug:
            return repo
    known = ", ".join(repo.slug for repo in repos) or "(none)"
    raise IngestError(f"No repo with slug '{slug}' in {path}. Known slugs: {known}")


def _parse_entry(entry: object, path: Path) -> Repo:
    if not isinstance(entry, dict):
        raise IngestError(f"Every entry in {path} must be a mapping, got: {entry!r}")
    fields = cast(dict[str, object], entry)
    missing = [name for name in _REQUIRED_FIELDS if not isinstance(fields.get(name), str)]
    if missing:
        raise IngestError(f"Entry {fields.get('slug', '?')} in {path} is missing: {missing}")
    repo = Repo(**{name: cast(str, fields[name]) for name in _REQUIRED_FIELDS})
    if not _SLUG_RE.fullmatch(repo.slug):
        raise IngestError(f"Invalid slug '{repo.slug}' in {path}.")
    if not _SHA_RE.fullmatch(repo.sha):
        raise IngestError(f"{repo.slug}: sha must be a full 40-char lowercase hex SHA.")
    return repo
