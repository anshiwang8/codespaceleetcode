"""The content checks in spec section 6.

Messages name a field, like answer.ids[1], and never quote its value, because this output ends up
in CI logs and answer keys must stay out of those.
"""

import re
from collections import Counter
from collections.abc import Container, Iterable
from dataclasses import dataclass, field
from itertools import pairwise
from pathlib import Path

from ingest.errors import IngestError
from ingest.puzzles import (
    Answer,
    ChoiceAnswer,
    FileAnswer,
    LoadFailure,
    LocationAnswer,
    Override,
    Puzzle,
    SequenceAnswer,
    SetAnswer,
    SymbolAnswer,
    load_puzzle,
    puzzle_files,
    puzzle_schema_validator,
    resolve_snapshot,
)
from ingest.repos import Repo, load_repos
from ingest.snapshot_index import IndexedSymbol, SnapshotIndex

# The heuristics a validator_overrides entry can cover. Must match the enum in puzzle.schema.json.
# set-count, location-window and choice-options can't be false positives, since each failure means
# the puzzle can't be solved or graded as written. So no override can cover them.
OVERRIDABLE_CHECKS = (
    "symbol-unique",
    "sequence-edges",
    "sequence-alternate-path",
)
_WARNING_CHECKS = frozenset({"sequence-alternate-path"})

_MAX_WINDOW_LINES = 30
_MIN_CHOICES = 3
_MAX_CHOICES = 5
_MAX_FILES_IN_MESSAGE = 10

_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}
_STATED_COUNT = re.compile(
    rf"\b(?:all|exactly|select|choose|pick)\s+(?:the\s+)?([0-9]+|{'|'.join(_NUMBER_WORDS)})\b",
    re.IGNORECASE,
)
_PATH_TOKEN = re.compile(r"[\w@+./-]+")


@dataclass(frozen=True)
class Finding:
    check: str
    message: str


@dataclass
class PuzzleResult:
    file: str
    puzzle_id: str | None
    puzzle: Puzzle | None
    errors: list[Finding] = field(default_factory=list[Finding])
    warnings: list[Finding] = field(default_factory=list[Finding])
    overridden: list[Override] = field(default_factory=list[Override])

    @property
    def passed(self) -> bool:
        return not self.errors and self.puzzle is not None

    def fail(self, check: str, message: str) -> None:
        self.errors.append(Finding(check, message))


@dataclass
class Report:
    results: list[PuzzleResult] = field(default_factory=list[PuzzleResult])

    @property
    def ok(self) -> bool:
        return all(result.passed for result in self.results)

    @property
    def puzzles(self) -> list[Puzzle]:
        return [result.puzzle for result in self.results if result.puzzle is not None]

    @property
    def unpublished(self) -> list[Puzzle]:
        return [
            result.puzzle
            for result in self.results
            if result.passed and result.puzzle is not None and not result.puzzle.verified_by
        ]


def validate_content(content_dir: Path, out_dir: Path) -> Report:
    if not content_dir.is_dir():
        raise IngestError(f"Content directory {content_dir} doesn't exist.")
    files = puzzle_files(content_dir)
    if not files:
        # Seeding treats a puzzle missing from content as deleted, so an empty run would remove all.
        raise IngestError(f"No puzzles found under {content_dir / 'puzzles'}.")
    report = Report()

    repos = _load_repos(content_dir)
    validator = puzzle_schema_validator()
    loaded = [(path, load_puzzle(path, validator)) for path in files]

    id_counts = Counter(_loaded_id(item) for _, item in loaded)
    id_counts.pop(None, None)
    indexes: dict[str, SnapshotIndex | IngestError] = {}
    for path, item in loaded:
        display = path.relative_to(content_dir / "puzzles").as_posix()
        if isinstance(item, LoadFailure):
            result = PuzzleResult(display, item.puzzle_id, None)
            for problem in item.problems:
                result.fail(item.check, problem)
        else:
            result = PuzzleResult(display, item.id, item)
            _check_puzzle(result, item, content_dir, out_dir, repos, indexes)
        if result.puzzle_id is not None and id_counts[result.puzzle_id] > 1:
            result.fail("id-unique", "another puzzle file has the same id")
        report.results.append(result)
    return report


def format_report(report: Report) -> list[str]:
    """The lines to print for a run, with no answer values in them."""
    lines: list[str] = []
    for result in report.results:
        if not (result.errors or result.warnings or result.overridden):
            continue
        lines.append(f"{'FAIL' if result.errors else 'ok  '} {result.file}")
        lines += [f"  error [{f.check}] {f.message}" for f in result.errors]
        lines += [f"  warning [{f.check}] {f.message}" for f in result.warnings]
        # Reasons are author prose that can name the answer, so only the check is printed.
        lines += [
            f"  override [{o.check}] applied, reason in the puzzle file" for o in result.overridden
        ]
    passed = sum(result.passed for result in report.results)
    failed = len(report.results) - passed
    lines.append(f"Validated {len(report.results)} puzzles: {passed} passed, {failed} failed.")
    unpublished = report.unpublished
    if unpublished:
        names = ", ".join(puzzle.id for puzzle in unpublished)
        lines.append(f"Unpublished, no blind second solve yet ({len(unpublished)}): {names}")
    return lines


def stated_paths(prompt: str, index: SnapshotIndex) -> tuple[set[str], set[str]]:
    """Find the files and directories a prompt names, as exact repo-relative paths in the manifest.

    A file can be a bare root-level name like `setup.py`. A directory needs a slash, so the word
    "lib" in a sentence doesn't count but `lib/` and `lib/router` do. Nothing vaguer, like "the
    router package", counts as a path.
    """
    files: set[str] = set()
    directories: set[str] = set()
    for token in _PATH_TOKEN.findall(prompt):
        candidate = token.removeprefix("./").rstrip(".,:;")
        if candidate in index.files:
            files.add(candidate)
        elif "/" in candidate and candidate.rstrip("/") in index.directories:
            directories.add(candidate.rstrip("/"))
    return files, directories


def _load_repos(content_dir: Path) -> list[Repo]:
    path = content_dir / "repos.yaml"
    if not path.is_file():
        raise IngestError(f"{path} doesn't exist.")
    return load_repos(path)


def _loaded_id(item: Puzzle | LoadFailure) -> str | None:
    return item.puzzle_id if isinstance(item, LoadFailure) else item.id


def _check_puzzle(
    result: PuzzleResult,
    puzzle: Puzzle,
    content_dir: Path,
    out_dir: Path,
    repos: list[Repo],
    indexes: dict[str, SnapshotIndex | IngestError],
) -> None:
    _check_file_layout(result, puzzle)
    _check_solution(result, puzzle, content_dir)
    _check_accept_reasons(result, puzzle.answer)

    repo = resolve_snapshot(puzzle.snapshot, repos)
    if repo is None:
        result.fail("snapshot", "snapshot doesn't match any repo and sha in repos.yaml")
        return
    if puzzle.snapshot_slug != puzzle.file.parent.name:
        result.fail("file-location", "the puzzle's directory must be its snapshot's repo slug")

    index = _snapshot_index(repo, out_dir, indexes)
    if isinstance(index, IngestError):
        result.fail("snapshot-index", f"{index} Run `uv run ingest snapshot {repo.slug}`.")
        return

    unresolved = _existence_problems(puzzle.answer, index)
    for problem in unresolved:
        result.fail("answer-exists", problem)
    _apply_overrides(result, puzzle, _heuristic_findings(puzzle, index, bool(unresolved)))


def _check_file_layout(result: PuzzleResult, puzzle: Puzzle) -> None:
    if puzzle.file.name != f"{puzzle.id}.yaml":
        result.fail("file-location", "the file must be named <id>.yaml")
    if puzzle.id.rsplit("-", 2)[1] != puzzle.type:
        result.fail("id-type", "the id's type segment must match the puzzle's type")


def _check_solution(result: PuzzleResult, puzzle: Puzzle, content_dir: Path) -> None:
    if puzzle.solution != f"solutions/{puzzle.id}.md":
        result.fail("solution", "solution must be solutions/<id>.md")
    elif not (content_dir / puzzle.solution).is_file():
        result.fail("solution", "the solution file doesn't exist")


def _check_accept_reasons(result: PuzzleResult, answer: Answer) -> None:
    if isinstance(answer, SymbolAnswer | FileAnswer):
        accepted, name = len(answer.accept), "accept"
    elif isinstance(answer, SequenceAnswer):
        accepted, name = len(answer.accept_sequences), "accept_sequences"
    else:
        return
    if len(answer.accept_reasons) != accepted:
        result.fail(
            "accept-reasons", f"every answer.{name} entry needs one answer.accept_reasons entry"
        )


def _snapshot_index(
    repo: Repo, out_dir: Path, indexes: dict[str, SnapshotIndex | IngestError]
) -> SnapshotIndex | IngestError:
    name = repo.snapshot_name
    if name not in indexes:
        try:
            indexes[name] = SnapshotIndex(out_dir / name)
        except IngestError as error:
            indexes[name] = error
    return indexes[name]


def _existence_problems(answer: Answer, index: SnapshotIndex) -> list[str]:
    problems: list[str] = []
    match answer:
        case SymbolAnswer():
            problems += _missing(["answer.id"], [answer.id], index.symbols)
            problems += _missing(
                _indexed("answer.accept", answer.accept), answer.accept, index.symbols
            )
        case FileAnswer():
            problems += _missing(["answer.path"], [answer.path], index.files)
            problems += _missing(
                _indexed("answer.accept", answer.accept), answer.accept, index.files
            )
        case SequenceAnswer():
            problems += _missing(_indexed("answer.ids", answer.ids), answer.ids, index.symbols)
            for position, sequence in enumerate(answer.accept_sequences):
                name = f"answer.accept_sequences[{position}]"
                problems += _missing(_indexed(name, sequence), sequence, index.symbols)
        case SetAnswer():
            members = index.files | index.symbols.keys()
            problems += _missing(_indexed("answer.ids", answer.ids), answer.ids, members)
        case LocationAnswer():
            if answer.path not in index.files:
                problems.append("answer.path doesn't resolve in the snapshot")
            else:
                lines = index.line_count(answer.path)
                problems += _line_range_problems("answer.anchor", answer.anchor, lines)
                problems += _line_range_problems("answer.window", answer.window, lines)
        case ChoiceAnswer():
            pass  # A choice isn't an index ID. choice-options checks it against `choices`.
    return problems


def _indexed(name: str, values: Iterable[str]) -> list[str]:
    return [f"{name}[{position}]" for position, _ in enumerate(values)]


def _missing(names: list[str], values: Iterable[str], known: Container[str]) -> list[str]:
    return [
        f"{name} doesn't resolve in the snapshot"
        for name, value in zip(names, values, strict=True)
        if value not in known
    ]


def _line_range_problems(name: str, span: tuple[int, int], line_count: int) -> list[str]:
    if span[0] > span[1]:
        return [f"{name}: the first line is after the last line"]
    if span[1] > line_count:
        return [f"{name}: the file has only {line_count} lines"]
    return []


def _heuristic_findings(puzzle: Puzzle, index: SnapshotIndex, unresolved: bool) -> list[Finding]:
    """Run the uniqueness heuristics. Unresolved IDs are already errors, so skip what needs them."""
    answer = puzzle.answer
    match answer:
        case SymbolAnswer():
            return [] if unresolved else _symbol_findings(answer, puzzle.prompt, index)
        case SequenceAnswer():
            return [] if unresolved else _sequence_findings(answer, index)
        case SetAnswer():
            return _set_findings(answer, puzzle.prompt)
        case LocationAnswer():
            return _location_findings(answer)
        case ChoiceAnswer():
            return _choice_findings(answer, puzzle)
        case FileAnswer():
            return []


def _symbol_findings(answer: SymbolAnswer, prompt: str, index: SnapshotIndex) -> list[Finding]:
    target = index.symbols[answer.id]
    others = [
        symbol
        for symbol in index.symbols_by_name[target.name]
        if symbol.symbol_id != answer.id and symbol.symbol_id not in answer.accept
    ]
    collisions, scope = _collisions_in_scope(target, others, prompt, index)
    if not collisions:
        return []
    return [
        Finding(
            "symbol-unique",
            f"{len(collisions)} other definition(s) share the answer's short name inside {scope}: "
            f"{_describe_files(collisions, target.file)}. Tighten the prompt's scope.",
        )
    ]


def _collisions_in_scope(
    target: IndexedSymbol, others: list[IndexedSymbol], prompt: str, index: SnapshotIndex
) -> tuple[list[IndexedSymbol], str]:
    """Narrow the other definitions to the prompt's stated scope, conservatively.

    A path only counts as scope if it contains the answer, since a prompt can mention other paths
    for context. If several do, the widest wins. With none, the scope is the whole snapshot, so
    wording this can't read, like "excluding tests", never excuses a collision.

    Naming the answer's file rules out other files, as section 6 says, but it can't tell apart two
    definitions inside that file, so those still count. A directory containing the answer is wider
    than its file, so when the prompt names both, the directory is the scope.
    """
    files, directories = stated_paths(prompt, index)
    scopes = sorted(d for d in directories if target.file.startswith(f"{d}/"))
    if scopes:
        inside = [s for s in others if any(s.file.startswith(f"{d}/") for d in scopes)]
        return inside, f"the prompt's scope ({', '.join(f'{d}/' for d in scopes)})"
    if target.file in files:
        return [s for s in others if s.file == target.file], "the file the prompt names"
    return others, "the whole snapshot, as the prompt names no path containing the answer"


def _describe_files(symbols: list[IndexedSymbol], answer_file: str) -> str:
    """List where collisions are. The answer's own file is only ever described, never named."""
    names = sorted({s.file for s in symbols if s.file != answer_file})
    shown = names[:_MAX_FILES_IN_MESSAGE]
    if len(names) > len(shown):
        shown.append(f"and {len(names) - len(shown)} more files")
    if any(s.file == answer_file for s in symbols):
        shown.insert(0, "the answer's own file")
    return ", ".join(shown)


def _sequence_findings(answer: SequenceAnswer, index: SnapshotIndex) -> list[Finding]:
    findings: list[Finding] = []
    sequences = [("answer.ids", answer.ids)] + [
        (f"answer.accept_sequences[{position}]", sequence)
        for position, sequence in enumerate(answer.accept_sequences)
    ]
    for name, sequence in sequences:
        for position, (caller, callee) in enumerate(pairwise(sequence)):
            if callee not in index.callees.get(caller, ()):
                findings.append(
                    Finding(
                        "sequence-edges",
                        f"{name}[{position}] -> {name}[{position + 1}] isn't an edge in "
                        "call_edges.jsonl",
                    )
                )
    if _has_alternate_path(answer, index.callees):
        findings.append(
            Finding(
                "sequence-alternate-path",
                "the start has another path to the end of equal or shorter length",
            )
        )
    return findings


def _has_alternate_path(answer: SequenceAnswer, callees: dict[str, set[str]]) -> bool:
    """Look for a simple path no longer than answer.ids that isn't an accepted sequence."""
    start, end = answer.ids[0], answer.ids[-1]
    budget = len(answer.ids) - 1
    distance_to_end = _distances_to(end, callees, budget)
    accepted = {answer.ids, *answer.accept_sequences}

    def search(path: tuple[str, ...]) -> bool:
        for callee in sorted(callees.get(path[-1], ())):
            if callee in path or len(path) + distance_to_end.get(callee, budget + 1) > budget:
                continue
            extended = (*path, callee)
            if callee == end:
                if extended not in accepted:
                    return True
            elif search(extended):
                return True
        return False

    return search((start,))


def _distances_to(end: str, callees: dict[str, set[str]], limit: int) -> dict[str, int]:
    callers: dict[str, list[str]] = {}
    for caller, targets in callees.items():
        for callee in targets:
            callers.setdefault(callee, []).append(caller)
    distances = {end: 0}
    frontier = [end]
    for distance in range(1, limit + 1):
        reached = [c for node in frontier for c in callers.get(node, ()) if c not in distances]
        for caller in reached:
            distances[caller] = distance
        frontier = reached
    return distances


def _set_findings(answer: SetAnswer, prompt: str) -> list[Finding]:
    findings: list[Finding] = []
    if len(set(answer.ids)) != len(answer.ids):
        findings.append(
            Finding("set-count", "answer.ids has duplicates, so the UI's count would be wrong")
        )
    for stated in _STATED_COUNT.findall(prompt):
        count = _NUMBER_WORDS.get(stated.lower()) or int(stated)
        if count != len(answer.ids):
            findings.append(Finding("set-count", "the count in the prompt isn't len(answer.ids)"))
            break
    return findings


def _location_findings(answer: LocationAnswer) -> list[Finding]:
    findings: list[Finding] = []
    if answer.anchor[0] < answer.window[0] or answer.anchor[1] > answer.window[1]:
        findings.append(Finding("location-window", "answer.anchor must lie within answer.window"))
    if answer.window[1] - answer.window[0] + 1 > _MAX_WINDOW_LINES:
        findings.append(
            Finding("location-window", f"answer.window is over {_MAX_WINDOW_LINES} lines")
        )
    return findings


def _choice_findings(answer: ChoiceAnswer, puzzle: Puzzle) -> list[Finding]:
    choices = puzzle.choices or ()
    findings: list[Finding] = []
    if not _MIN_CHOICES <= len(choices) <= _MAX_CHOICES:
        findings.append(
            Finding("choice-options", f"needs {_MIN_CHOICES} to {_MAX_CHOICES} options")
        )
    ids = [choice.id for choice in choices]
    labels = [choice.label for choice in choices]
    if len(set(ids)) != len(ids) or len(set(labels)) != len(labels):
        findings.append(Finding("choice-options", "option ids and labels must be unique"))
    if answer.option not in ids:
        findings.append(Finding("choice-options", "answer.option isn't one of the choices"))
    return findings


def _apply_overrides(result: PuzzleResult, puzzle: Puzzle, findings: list[Finding]) -> None:
    overrides = {override.check: override for override in puzzle.overrides}
    triggered = {finding.check for finding in findings}
    for finding in findings:
        if finding.check in overrides:
            continue
        (result.warnings if finding.check in _WARNING_CHECKS else result.errors).append(finding)
    result.overridden += [o for o in overrides.values() if o.check in triggered]
    # An override that covers nothing has gone stale, or never applied. Say so, so it gets removed.
    result.warnings += [
        Finding("override-unused", f"nothing triggered the override for {check}")
        for check in overrides
        if check not in triggered
    ]
