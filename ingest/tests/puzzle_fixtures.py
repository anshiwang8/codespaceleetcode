"""Locations of the synthetic puzzle fixtures, and a way to validate one case at a time."""

from pathlib import Path
from typing import Any, cast

import yaml

from ingest.validate import Report, validate_content

FIXTURES = Path(__file__).parent / "fixtures"
CONTENT = FIXTURES / "puzzle-content"
SNAPSHOTS = FIXTURES / "puzzle-snapshots"
CASES = FIXTURES / "puzzle-cases"
SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"
SNAPSHOT_NAME = f"acme-widgets@{SHA}"


def content_with_case(content_dir: Path, document_text: str, fallback_name: str) -> Path:
    """Build a content tree holding one puzzle, laid out correctly unless the case is about that.

    The solution file is written where the puzzle's id says, so only a case that points somewhere
    else, or is deliberately named solution--, fails the solution check.
    """
    (content_dir / "puzzles").mkdir(parents=True)
    (content_dir / "solutions").mkdir()
    (content_dir / "repos.yaml").write_bytes((CONTENT / "repos.yaml").read_bytes())
    try:
        parsed = yaml.safe_load(document_text)
    except yaml.YAMLError:
        parsed = None
    document = cast(dict[str, Any], parsed) if isinstance(parsed, dict) else {}
    puzzle_id = document.get("id", fallback_name)
    slug = str(document.get("snapshot", "acme-widgets@")).partition("@")[0]
    directory = content_dir / "puzzles" / slug
    directory.mkdir()
    (directory / f"{puzzle_id}.yaml").write_text(document_text, encoding="utf-8", newline="\n")
    if not fallback_name.startswith("solution--"):
        (content_dir / "solutions" / f"{puzzle_id}.md").write_text("Solution.\n", encoding="utf-8")
    return content_dir


def validate_case(tmp_path: Path, path: Path) -> Report:
    content = content_with_case(tmp_path / "content", path.read_text(encoding="utf-8"), path.stem)
    return validate_content(content, SNAPSHOTS)
