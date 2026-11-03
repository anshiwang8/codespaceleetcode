"""Tooling for a blind second solve by a separate agent (spec section 6)."""

import hashlib
import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import yaml

from ingest.errors import IngestError
from ingest.grading import is_correct, shape_problem
from ingest.puzzles import (
    LoadFailure,
    Puzzle,
    load_puzzle,
    puzzle_files,
    puzzle_schema_validator,
    resolve_snapshot,
    solver_name,
)
from ingest.repos import Repo, load_repos

_SOLVER_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
_VERIFIED_LINE = re.compile(r"^verified_by:[ \t]*(?P<rest>[^\r\n]*)(?P<eol>\r?\n|\Z)", re.MULTILINE)
_FLOW_LIST = re.compile(r"\[(?P<items>[^\]#]*)\](?P<tail>\s*(?:#.*)?)")
_BLOCK_ITEM = re.compile(r"(?P<indent>[ \t]*)- ")

# Each solver's first graded result per version of a puzzle, committed with the content. A blind
# solve gets one attempt: pass or fail on every run would let a solver guess until it passes.
LEDGER_NAME = "blind-attempts.json"
_REPEAT_NOTE = "first attempt's result: a blind solve gets one attempt at each version of a puzzle"


@dataclass(frozen=True)
class CheckResult:
    puzzle_id: str
    passed: bool
    # Why a submission couldn't be graded, or that this repeats the first attempt's result. Never
    # says anything about the key.
    problem: str | None = None


def export_puzzles(content_dir: Path, repo_slug: str | None) -> list[dict[str, object]]:
    """What a blind solver may see. Fields are listed by name, so a new one stays out by default."""
    repos = load_repos(content_dir / "repos.yaml")
    if repo_slug is not None and not any(repo.slug == repo_slug for repo in repos):
        raise IngestError(f"No repo with slug '{repo_slug}' in repos.yaml.")

    return [
        _solver_view(puzzle, repos)
        for puzzle in _load_all(content_dir)
        if repo_slug is None or puzzle.snapshot_slug == repo_slug
    ]


def _solver_view(puzzle: Puzzle, repos: list[Repo]) -> dict[str, object]:
    repo = resolve_snapshot(puzzle.snapshot, repos)
    if repo is None:
        raise IngestError(f"{puzzle.id}: its snapshot isn't in repos.yaml.")
    return {
        "id": puzzle.id,
        "snapshot": repo.snapshot_name,
        "type": puzzle.type,
        "difficulty": puzzle.difficulty,
        "prompt": puzzle.prompt,
        "answerKind": puzzle.answer.kind,
        "setCount": puzzle.set_count,
        "choices": None
        if puzzle.choices is None
        else [{"id": choice.id, "label": choice.label} for choice in puzzle.choices],
    }


def _version(puzzle: Puzzle, repos: list[Repo]) -> str:
    """Identifies what the solver was shown.

    Built from the export alone: a hash that covered the key could be reversed by trying each choice
    or symbol.
    """
    view = json.dumps(_solver_view(puzzle, repos), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(view.encode("utf-8")).hexdigest()


def write_export(puzzles: list[dict[str, object]], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(puzzles, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def check_answers(
    content_dir: Path, answers_path: Path, solver: str, write: bool, echo: Callable[[str], None]
) -> list[CheckResult]:
    """Grade a solver's answers. Output says pass or fail only, and never shows the key."""
    verifier = verifier_name(solver)
    answers = _read_answers(answers_path)
    puzzles = {puzzle.id: puzzle for puzzle in _load_all(content_dir)}
    repos = load_repos(content_dir / "repos.yaml")
    ledger_path = content_dir / LEDGER_NAME
    ledger = _read_ledger(ledger_path)
    attempts = ledger.setdefault(verifier, {})

    results: list[CheckResult] = []
    for puzzle_id in sorted(answers):
        puzzle = puzzles.get(puzzle_id)
        version = None if puzzle is None else _version(puzzle, repos)
        earlier = attempts.get(puzzle_id)
        if earlier is not None and earlier["version"] == version:
            results.append(CheckResult(puzzle_id, earlier["passed"] is True, _REPEAT_NOTE))
            continue
        result = _check_one(puzzle_id, answers[puzzle_id], puzzles)
        # Only a graded answer uses the attempt. Unknown or malformed ones reveal nothing.
        if version is not None and result.problem is None:
            attempts[puzzle_id] = {"version": version, "passed": result.passed}
        results.append(result)
    _write_ledger(ledger_path, ledger)

    for result in results:
        reason = f" ({result.problem})" if result.problem else ""
        echo(f"{'PASS' if result.passed else 'FAIL'} {result.puzzle_id}{reason}")

    passed = [result.puzzle_id for result in results if result.passed]
    unanswered = sorted(set(puzzles) - set(answers))
    echo(
        f"{len(passed)} passed, {len(results) - len(passed)} failed, {len(unanswered)} unanswered."
    )
    if write:
        added = 0
        for puzzle_id in passed:
            puzzle = puzzles[puzzle_id]
            if any(solver_name(author) == solver_name(verifier) for author in puzzle.authors):
                echo(f"Not recording {puzzle_id}: {solver} wrote it, so this isn't a second solve.")
            elif add_verifier(puzzle.file, verifier):
                added += 1
        echo(f"Added {verifier} to verified_by in {added} puzzle files.")
    return results


def verifier_name(solver: str) -> str:
    if not _SOLVER_NAME.fullmatch(solver):
        raise IngestError("--solver must be a bare name of letters, digits, '.', '_' or '-'.")
    return f"agent:{solver}"


def add_verifier(path: Path, verifier: str) -> bool:
    """Add a name to verified_by by editing that one line, so comments and layout are untouched.

    Returns False if the name was already there. Refuses rather than guesses if the result doesn't
    parse back to the same document plus that one name.
    """
    original = path.read_bytes().decode("utf-8")
    document = cast(dict[str, Any], yaml.safe_load(original))
    if verifier in document["verified_by"]:
        return False
    updated = _insert_verifier(original, verifier, path)

    expected = {**document, "verified_by": [*document["verified_by"], verifier]}
    if yaml.safe_load(updated) != expected:
        raise IngestError(f"{path}: couldn't edit verified_by safely. Add {verifier} by hand.")
    path.write_bytes(updated.encode("utf-8"))
    return True


def _insert_verifier(text: str, verifier: str, path: Path) -> str:
    line = _VERIFIED_LINE.search(text)
    if line is None:
        raise IngestError(f"{path}: no top-level verified_by line.")
    rest = line["rest"]
    flow = _FLOW_LIST.fullmatch(rest)
    if flow is not None:
        items = flow["items"].strip()
        listed = f"{items}, {verifier}" if items else verifier
        edited = f"verified_by: [{listed}]{flow['tail']}{line['eol']}"
        return f"{text[: line.start()]}{edited}{text[line.end() :]}"
    if rest and not rest.startswith("#"):
        raise IngestError(f"{path}: couldn't edit verified_by safely. Add {verifier} by hand.")

    position = line.end()
    indent = ""
    while position < len(text):
        next_end = text.find("\n", position)
        next_end = len(text) if next_end == -1 else next_end + 1
        item = _BLOCK_ITEM.match(text, position)
        if item is None:
            break
        indent = item["indent"]
        position = next_end
    if position == line.end():
        raise IngestError(f"{path}: couldn't edit verified_by safely. Add {verifier} by hand.")
    prefix = text[:position]
    item_line = f"{indent}- {verifier}"
    if prefix.endswith("\n"):
        return f"{prefix}{item_line}{line['eol']}{text[position:]}"
    return f"{prefix}{line['eol']}{item_line}"


def _check_one(puzzle_id: str, submission: object, puzzles: dict[str, Puzzle]) -> CheckResult:
    puzzle = puzzles.get(puzzle_id)
    if puzzle is None:
        return CheckResult(puzzle_id, False, "no such puzzle")
    problem = shape_problem(puzzle.answer.kind, submission)
    if problem is not None:
        return CheckResult(puzzle_id, False, f"malformed: {problem}")
    return CheckResult(puzzle_id, is_correct(puzzle.answer, submission))


Ledger = dict[str, dict[str, dict[str, object]]]


def _read_ledger(path: Path) -> Ledger:
    """A broken ledger is an error. Treating it as empty would hand out fresh attempts."""
    if not path.exists():
        return {}
    try:
        raw: object = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as error:
        raise IngestError(f"{path} isn't valid JSON. Fix it by hand.") from error
    malformed = IngestError(f"{path} isn't a blind-check ledger. Fix it by hand.")
    if not isinstance(raw, dict):
        raise malformed
    for attempts in cast(dict[str, object], raw).values():
        if not isinstance(attempts, dict):
            raise malformed
        for entry in cast(dict[str, object], attempts).values():
            if not isinstance(entry, dict):
                raise malformed
            fields = cast(dict[str, object], entry)
            if not isinstance(fields.get("version"), str) or not isinstance(
                fields.get("passed"), bool
            ):
                raise malformed
    return cast(Ledger, raw)


def _write_ledger(path: Path, ledger: Ledger) -> None:
    cleaned = {solver: attempts for solver, attempts in ledger.items() if attempts}
    if not cleaned and not path.exists():
        return
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(cleaned, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def _read_answers(path: Path) -> dict[str, object]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise IngestError(f"{path} doesn't exist.") from error
    except ValueError as error:
        raise IngestError(f"{path} isn't valid JSON.") from error
    if not isinstance(raw, dict):
        raise IngestError(f"{path} must map puzzle id to a submission.")
    return cast(dict[str, object], raw)


def _load_all(content_dir: Path) -> list[Puzzle]:
    validator = puzzle_schema_validator()
    puzzles: list[Puzzle] = []
    broken: list[str] = []
    for path in puzzle_files(content_dir):
        loaded = load_puzzle(path, validator)
        if isinstance(loaded, LoadFailure):
            broken.append(path.name)
        else:
            puzzles.append(loaded)
    if broken:
        raise IngestError(f"These puzzles don't load, run `pnpm validate`: {', '.join(broken)}")
    return puzzles
