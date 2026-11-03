"""repos.yaml: each entry is checked before anything is fetched or written from it."""

from pathlib import Path

import pytest

from ingest.errors import IngestError
from ingest.paths import REPO_ROOT
from ingest.repos import Repo, load_repos

SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"


def _entry(slug: str = "acme-widgets", url: str = "https://github.com/acme/widgets") -> str:
    return f"- slug: {slug}\n  url: '{url}'\n  sha: {SHA}\n  language: typescript\n  license: MIT\n"


def _load(tmp_path: Path, text: str) -> list[Repo]:
    path = tmp_path / "repos.yaml"
    path.write_text(text, encoding="utf-8")
    return load_repos(path)


def test_the_real_repos_yaml_loads() -> None:
    repos = load_repos(REPO_ROOT / "content" / "repos.yaml")
    assert len({repo.slug for repo in repos}) == len(repos)


def test_a_valid_entry_loads(tmp_path: Path) -> None:
    [repo] = _load(tmp_path, _entry())
    assert repo.url == "https://github.com/acme/widgets"


def test_duplicate_slugs_are_refused(tmp_path: Path) -> None:
    # Snapshots and puzzles find their repo by slug, so a second entry would be silently ignored.
    with pytest.raises(IngestError, match=r"acme-widgets.*more than once"):
        _load(tmp_path, _entry() + _entry(url="https://github.com/acme/other"))


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/acme/widgets",
        "git://github.com/acme/widgets",
        "ssh://git@github.com/acme/widgets",
        "git@github.com:acme/widgets.git",
        "file:///etc",
        "ext::sh -c touch% /tmp/pwned",
        "javascript:alert(1)",
        "https://",
        "https:///acme/widgets",
        "https://user:secret@github.com/acme/widgets",
        "https://github.com/acme/widgets two",
        "-https://github.com/acme/widgets",
        " https://github.com/acme/widgets",
    ],
)
def test_only_plain_https_urls_are_allowed(tmp_path: Path, url: str) -> None:
    # The URL goes to git fetch and into the manifest, which the site links to.
    with pytest.raises(IngestError, match="https"):
        _load(tmp_path, _entry(url=url))
