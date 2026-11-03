"""Blind-solve tooling: the export can't carry the key, and the check can't reveal it."""

import json
import shutil
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from puzzle_fixtures import CONTENT, SNAPSHOT_NAME, SNAPSHOTS
from typer.testing import CliRunner

from ingest.blind import add_verifier, export_puzzles
from ingest.cli import app
from ingest.errors import IngestError
from ingest.puzzles import puzzle_files
from ingest.validate import validate_content

# The correct submission for each puzzle in the content fixture.
CORRECT: dict[str, dict[str, object]] = {
    "widgets-find-001": {"kind": "symbol", "id": "src/router/layer.js#Layer.match"},
    "widgets-find-002": {"kind": "symbol", "id": "src/legacy/view.js#View.render"},
    "widgets-find-003": {"kind": "file", "path": "src/config.js"},
    "widgets-find-004": {"kind": "location", "id": "src/config.js:L10-L12"},
    "widgets-trace-001": {
        "kind": "sequence",
        "ids": [
            "src/jobs/job.js#Job.run",
            "src/jobs/job.js#Job.step",
            "src/jobs/job.js#Job.finish",
        ],
    },
    "widgets-architecture-001": {
        "kind": "set",
        "ids": ["src/shapes.js", "src/queue.js", "src/app.js"],
    },
    "widgets-architecture-002": {"kind": "choice", "option": "b"},
    "widgets-architecture-003": {"kind": "symbol", "id": "src/index.js#parse"},
}
EXPORTED_FIELDS = {
    "id",
    "snapshot",
    "type",
    "difficulty",
    "prompt",
    "answerKind",
    "setCount",
    "choices",
}


def _documents() -> list[dict[str, Any]]:
    return [
        cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
        for path in puzzle_files(CONTENT)
    ]


def _answer_values(answer: dict[str, Any]) -> list[str]:
    """Every value in an answer block, except what a solver needs to see to answer at all."""
    values: list[str] = []

    def collect(value: object) -> None:
        if isinstance(value, dict):
            for item in cast(dict[str, object], value).values():
                collect(item)
        elif isinstance(value, list):
            for item in cast(list[object], value):
                collect(item)
        elif isinstance(value, str):
            values.append(value)

    collect({key: value for key, value in answer.items() if key not in {"kind", "option"}})
    return values


def _export_text(tmp_path: Path) -> str:
    out = tmp_path / "export.json"
    result = CliRunner().invoke(
        app, ["blind-export", "--out", str(out), "--content-dir", str(CONTENT)]
    )
    assert result.exit_code == 0
    return out.read_text(encoding="utf-8")


def test_export_never_contains_an_answer_value(tmp_path: Path) -> None:
    text = _export_text(tmp_path)
    checked = 0
    for document in _documents():
        for value in _answer_values(document["answer"]):
            assert value not in text
            checked += 1
    assert checked > 10


def test_export_never_contains_line_numbers_of_a_location(tmp_path: Path) -> None:
    exported = json.loads(_export_text(tmp_path))
    location = next(puzzle for puzzle in exported if puzzle["answerKind"] == "location")
    assert "anchor" not in json.dumps(location)
    assert "window" not in json.dumps(location)


def test_export_has_only_the_fields_a_solver_may_see(tmp_path: Path) -> None:
    exported = json.loads(_export_text(tmp_path))
    assert len(exported) == len(_documents())
    for puzzle in exported:
        assert set(puzzle) == EXPORTED_FIELDS


def test_export_leaves_out_hints_solutions_and_who_verified(tmp_path: Path) -> None:
    text = _export_text(tmp_path)
    assert "FIXTURE-HINT" not in text
    assert "FIXTURE-SOLUTION" not in text
    assert "solutions/" not in text
    assert "verified_by" not in text
    assert "agent:fixture-solver" not in text


def test_export_choices_dont_mark_the_correct_one(tmp_path: Path) -> None:
    exported = json.loads(_export_text(tmp_path))
    choice = next(puzzle for puzzle in exported if puzzle["answerKind"] == "choice")
    assert [option["id"] for option in choice["choices"]] == ["a", "b", "c"]
    assert all(set(option) == {"id", "label"} for option in choice["choices"])
    assert "option" not in choice


def test_export_shows_full_snapshot_name_and_set_count(tmp_path: Path) -> None:
    exported = {p["id"]: p for p in json.loads(_export_text(tmp_path))}
    assert exported["widgets-find-003"]["snapshot"] == SNAPSHOT_NAME
    assert exported["widgets-architecture-001"]["setCount"] == 3
    assert exported["widgets-find-001"]["setCount"] is None


def test_export_filters_by_repo() -> None:
    assert export_puzzles(CONTENT, "ghost-repo") == []
    assert len(export_puzzles(CONTENT, "acme-widgets")) == 8
    with pytest.raises(IngestError):
        export_puzzles(CONTENT, "no-such-repo")


def _check(
    content: Path, tmp_path: Path, answers: object, *extra: str, solver: str = "solver-a"
) -> Any:
    path = tmp_path / "answers.json"
    path.write_text(json.dumps(answers), encoding="utf-8")
    return CliRunner().invoke(
        app,
        ["blind-check", str(path), "--solver", solver, "--content-dir", str(content), *extra],
    )


def _content(tmp_path: Path) -> Path:
    """A copy of the content fixture, since checking records attempts in the content folder."""
    content = tmp_path / "content"
    shutil.copytree(CONTENT, content)
    return content


def test_check_passes_every_correct_answer(tmp_path: Path) -> None:
    result = _check(_content(tmp_path), tmp_path, CORRECT)
    assert result.exit_code == 0
    for puzzle_id in CORRECT:
        assert f"PASS {puzzle_id}" in result.output
    assert "8 passed, 0 failed, 0 unanswered." in result.output


def test_check_never_reveals_the_key_on_failure(tmp_path: Path) -> None:
    wrong: dict[str, object] = {
        "widgets-find-001": {"kind": "symbol", "id": "src/app.js#App.render"},
        "widgets-find-002": {"kind": "file", "path": "src/app.js"},
        "widgets-find-003": {"kind": "file", "path": "src/app.js"},
        "widgets-find-004": {"kind": "location", "id": "src/config.js:L1-L2"},
        "widgets-trace-001": {"kind": "sequence", "ids": ["src/jobs/job.js#Job.run"]},
        "widgets-architecture-001": {"kind": "set", "ids": ["src/app.js"]},
        "widgets-architecture-002": {"kind": "choice", "option": "a"},
        "widgets-architecture-003": "not a submission",
    }
    result = _check(_content(tmp_path), tmp_path, wrong)
    assert result.exit_code == 1
    for puzzle_id in wrong:
        assert f"FAIL {puzzle_id}" in result.output
    for document in _documents():
        for value in _answer_values(document["answer"]):
            assert value not in result.output


def test_check_flags_malformed_and_unknown_answers(tmp_path: Path) -> None:
    result = _check(
        _content(tmp_path),
        tmp_path,
        {
            "widgets-architecture-002": {"kind": "symbol", "id": "x"},
            "no-such-puzzle": {"kind": "symbol", "id": "x"},
        },
    )
    assert result.exit_code == 1
    assert "FAIL widgets-architecture-002 (malformed:" in result.output
    assert "FAIL no-such-puzzle (no such puzzle)" in result.output


def test_check_without_write_changes_no_puzzle(tmp_path: Path) -> None:
    content = tmp_path / "content"
    shutil.copytree(CONTENT, content)
    before = {path: path.read_bytes() for path in puzzle_files(content)}
    _check(content, tmp_path, CORRECT)
    assert {path: path.read_bytes() for path in puzzle_files(content)} == before


def test_write_records_passes_only_and_changes_only_that_line(tmp_path: Path) -> None:
    content = tmp_path / "content"
    shutil.copytree(CONTENT, content)
    directory = content / "puzzles" / "acme-widgets"
    passing = directory / "widgets-find-003.yaml"
    failing = directory / "widgets-find-002.yaml"
    passing_before = passing.read_text(encoding="utf-8")
    failing_before = failing.read_bytes()

    result = _check(
        content,
        tmp_path,
        {
            "widgets-find-003": {"kind": "file", "path": "src/config.js"},
            "widgets-find-002": {"kind": "symbol", "id": "src/app.js#App.render"},
        },
        "--write",
    )

    assert result.exit_code == 1
    assert failing.read_bytes() == failing_before
    expected = passing_before.replace(
        "verified_by: []   # filled in by the blind second solver",
        "verified_by: [agent:solver-a]   # filled in by the blind second solver",
    )
    assert passing.read_text(encoding="utf-8") == expected
    assert "# A comment that must survive." in expected


def test_written_puzzle_still_validates_and_counts_as_verified(tmp_path: Path) -> None:
    content = tmp_path / "content"
    shutil.copytree(CONTENT, content)
    _check(content, tmp_path, CORRECT, "--write")
    report = validate_content(content, SNAPSHOTS)
    assert report.ok
    assert report.unpublished == []
    assert all("agent:solver-a" in puzzle.verified_by for puzzle in report.puzzles)


def test_write_twice_adds_the_name_once(tmp_path: Path) -> None:
    content = tmp_path / "content"
    shutil.copytree(CONTENT, content)
    _check(content, tmp_path, CORRECT, "--write")
    after_first = {path: path.read_bytes() for path in puzzle_files(content)}
    _check(content, tmp_path, CORRECT, "--write")
    assert {path: path.read_bytes() for path in puzzle_files(content)} == after_first


def test_an_author_cant_verify_their_own_puzzle(tmp_path: Path) -> None:
    content = tmp_path / "content"
    shutil.copytree(CONTENT, content)
    path = content / "puzzles" / "acme-widgets" / "widgets-find-003.yaml"
    path.write_text(
        path.read_text(encoding="utf-8").replace("[fixture-author]", "[solver-a]"), encoding="utf-8"
    )
    result = _check(
        content,
        tmp_path,
        {"widgets-find-003": {"kind": "file", "path": "src/config.js"}},
        "--write",
    )
    assert "Not recording widgets-find-003" in result.output
    assert "agent:" not in path.read_text(encoding="utf-8")


@pytest.mark.parametrize("solver", ["agent:x", "has space", "", "a,b", "a]b"])
def test_solver_name_is_restricted(tmp_path: Path, solver: str) -> None:
    path = tmp_path / "answers.json"
    path.write_text("{}", encoding="utf-8")
    result = CliRunner().invoke(
        app, ["blind-check", str(path), "--solver", solver, "--content-dir", str(CONTENT)]
    )
    assert result.exit_code == 1


@pytest.mark.parametrize(
    ("before", "after"),
    [
        ("verified_by: []\n", "verified_by: [agent:s]\n"),
        ("verified_by: [anshi]\n", "verified_by: [anshi, agent:s]\n"),
        ("verified_by: [ anshi, bo ]  # why\n", "verified_by: [anshi, bo, agent:s]  # why\n"),
        ("verified_by: []\r\n", "verified_by: [agent:s]\r\n"),
        ("verified_by: []", "verified_by: [agent:s]"),
        ("verified_by:\n  - anshi\n", "verified_by:\n  - anshi\n  - agent:s\n"),
        ("verified_by:\n- anshi\n", "verified_by:\n- anshi\n- agent:s\n"),
        ("verified_by: # why\n  - anshi\n", "verified_by: # why\n  - anshi\n  - agent:s\n"),
        ("verified_by:\n  - anshi", "verified_by:\n  - anshi\n  - agent:s"),
        ("verified_by:\r\n  - anshi\r\n", "verified_by:\r\n  - anshi\r\n  - agent:s\r\n"),
    ],
)
def test_add_verifier_keeps_layout(tmp_path: Path, before: str, after: str) -> None:
    path = tmp_path / "puzzle.yaml"
    surrounding = "id: x\n" + before
    path.write_bytes(surrounding.encode("utf-8"))
    assert add_verifier(path, "agent:s")
    assert path.read_bytes().decode("utf-8") == "id: x\n" + after


def test_add_verifier_keeps_keys_after_a_block_list(tmp_path: Path) -> None:
    path = tmp_path / "puzzle.yaml"
    path.write_text("verified_by:\n  - anshi\ntags: [a]\n", encoding="utf-8")
    assert add_verifier(path, "agent:s")
    assert path.read_text(encoding="utf-8") == "verified_by:\n  - anshi\n  - agent:s\ntags: [a]\n"


def test_add_verifier_refuses_what_it_cant_edit_safely(tmp_path: Path) -> None:
    path = tmp_path / "puzzle.yaml"
    original = "verified_by: [\n  anshi,\n]\n"
    path.write_text(original, encoding="utf-8")
    with pytest.raises(IngestError):
        add_verifier(path, "agent:s")
    assert path.read_text(encoding="utf-8") == original


LEDGER = "blind-attempts.json"


def test_a_retry_gets_the_first_attempts_result(tmp_path: Path) -> None:
    content = _content(tmp_path)
    assert (
        _check(
            content, tmp_path, {"widgets-architecture-002": {"kind": "choice", "option": "a"}}
        ).exit_code
        == 1
    )
    retry = _check(
        content,
        tmp_path,
        {"widgets-architecture-002": CORRECT["widgets-architecture-002"]},
        "--write",
    )
    assert retry.exit_code == 1
    assert "FAIL widgets-architecture-002 (first attempt's result" in retry.output
    path = content / "puzzles" / "acme-widgets" / "widgets-architecture-002.yaml"
    assert "agent:solver-a" not in path.read_text(encoding="utf-8")


def test_a_first_attempt_pass_can_be_recorded_later(tmp_path: Path) -> None:
    content = _content(tmp_path)
    answers = {"widgets-find-003": CORRECT["widgets-find-003"]}
    assert _check(content, tmp_path, answers).exit_code == 0
    # Even a different answer now only repeats the first result, so this can't be gamed either way.
    later = _check(
        content, tmp_path, {"widgets-find-003": {"kind": "file", "path": "src/app.js"}}, "--write"
    )
    assert later.exit_code == 0
    assert "PASS widgets-find-003 (first attempt's result" in later.output
    path = content / "puzzles" / "acme-widgets" / "widgets-find-003.yaml"
    assert "agent:solver-a" in path.read_text(encoding="utf-8")


def test_a_changed_prompt_gets_a_fresh_attempt(tmp_path: Path) -> None:
    content = _content(tmp_path)
    _check(content, tmp_path, {"widgets-architecture-002": {"kind": "choice", "option": "a"}})
    path = content / "puzzles" / "acme-widgets" / "widgets-architecture-002.yaml"
    document = path.read_text(encoding="utf-8")
    prompt = cast(dict[str, Any], yaml.safe_load(document))["prompt"]
    path.write_text(document.replace(prompt.split()[0], "Reworded:", 1), encoding="utf-8")
    assert yaml.safe_load(path.read_text(encoding="utf-8"))["prompt"] != prompt
    result = _check(
        content, tmp_path, {"widgets-architecture-002": CORRECT["widgets-architecture-002"]}
    )
    assert "PASS widgets-architecture-002" in result.output
    assert "first attempt" not in result.output


def test_malformed_and_unknown_answers_dont_use_the_attempt(tmp_path: Path) -> None:
    content = _content(tmp_path)
    _check(
        content,
        tmp_path,
        {"widgets-find-003": {"kind": "symbol", "id": "x"}, "no-such-puzzle": "x"},
    )
    result = _check(content, tmp_path, {"widgets-find-003": CORRECT["widgets-find-003"]})
    assert result.exit_code == 0
    assert "first attempt" not in result.output


def test_each_solver_gets_its_own_attempt(tmp_path: Path) -> None:
    content = _content(tmp_path)
    _check(content, tmp_path, {"widgets-architecture-002": {"kind": "choice", "option": "a"}})
    other = _check(
        content,
        tmp_path,
        {"widgets-architecture-002": CORRECT["widgets-architecture-002"]},
        solver="solver-b",
    )
    assert other.exit_code == 0


def test_the_attempt_ledger_never_holds_an_answer(tmp_path: Path) -> None:
    content = _content(tmp_path)
    _check(content, tmp_path, CORRECT)
    ledger = (content / LEDGER).read_text(encoding="utf-8")
    for document in _documents():
        for value in _answer_values(document["answer"]):
            assert value not in ledger


def test_a_broken_ledger_is_an_error_not_a_reset(tmp_path: Path) -> None:
    content = _content(tmp_path)
    (content / LEDGER).write_text("{not json", encoding="utf-8")
    result = _check(content, tmp_path, CORRECT)
    assert result.exit_code == 1
    assert "PASS" not in result.output
