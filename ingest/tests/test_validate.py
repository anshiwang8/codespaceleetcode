"""Validator fixtures that must pass and must fail, one per check (CLAUDE.md, Testing)."""

import json
import shutil
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from jsonschema import Draft202012Validator
from puzzle_fixtures import CASES, CONTENT, SNAPSHOTS, content_with_case, validate_case
from typer.testing import CliRunner

from ingest.cli import app
from ingest.errors import IngestError
from ingest.puzzles import SCHEMA_PATH
from ingest.validate import OVERRIDABLE_CHECKS, Report, format_report, validate_content

MUST_FAIL = sorted((CASES / "must_fail").glob("*.yaml"))
MUST_PASS = sorted((CASES / "must_pass").glob("*.yaml"))
# Every check the validator can fail with, so a check can't lose its fixture unnoticed.
FAILING_CHECKS = {
    "yaml",
    "schema",
    "id-type",
    "snapshot",
    "snapshot-index",
    "solution",
    "answer-exists",
    "accept-reasons",
    "symbol-unique",
    "sequence-edges",
    "set-count",
    "location-window",
    "choice-options",
    "verifier-not-author",
}


def _checks(report: Report) -> set[str]:
    return {finding.check for result in report.results for finding in result.errors}


def _warnings(report: Report) -> set[str]:
    return {finding.check for result in report.results for finding in result.warnings}


def _expected_check(path: Path) -> str:
    return path.stem.split("--")[0]


def _copy_content(tmp_path: Path) -> Path:
    target = tmp_path / "content"
    shutil.copytree(CONTENT, target)
    return target


def test_real_schema_is_valid_and_lists_every_overridable_check() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    overrides = schema["properties"]["validator_overrides"]["items"]["properties"]
    assert tuple(overrides["check"]["enum"]) == OVERRIDABLE_CHECKS


def test_every_check_has_a_must_fail_fixture() -> None:
    assert {_expected_check(path) for path in MUST_FAIL} == FAILING_CHECKS


def test_the_content_fixture_passes_with_no_warnings() -> None:
    report = validate_content(CONTENT, SNAPSHOTS)
    assert _checks(report) == set()
    assert _warnings(report) == set()
    assert report.ok
    assert len(report.results) == 8


def test_every_answer_kind_is_covered_by_the_content_fixture() -> None:
    kinds = {puzzle.answer.kind for puzzle in validate_content(CONTENT, SNAPSHOTS).puzzles}
    assert kinds == {"symbol", "file", "location", "sequence", "set", "choice"}


@pytest.mark.parametrize("path", MUST_PASS, ids=lambda path: path.stem)
def test_must_pass(path: Path, tmp_path: Path) -> None:
    report = validate_case(tmp_path, path)
    assert _checks(report) == set()
    assert _warnings(report) == set()
    assert report.ok


@pytest.mark.parametrize("path", MUST_FAIL, ids=lambda path: path.stem)
def test_must_fail(path: Path, tmp_path: Path) -> None:
    report = validate_case(tmp_path, path)
    assert not report.ok
    assert _checks(report) == {_expected_check(path)}


@pytest.mark.parametrize(
    "path",
    [path for path in MUST_FAIL if _expected_check(path) in OVERRIDABLE_CHECKS],
    ids=lambda path: path.stem,
)
def test_a_written_override_covers_a_heuristic(path: Path, tmp_path: Path) -> None:
    document = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
    check = _expected_check(path)
    document["validator_overrides"] = [{"check": check, "reason": "A checked false positive."}]
    text = yaml.safe_dump(document, sort_keys=False)
    report = validate_content(content_with_case(tmp_path / "c", text, path.stem), SNAPSHOTS)
    assert report.ok
    assert check in {o.check for result in report.results for o in result.overridden}
    # The reason is author prose that can name the answer, so it stays in the file, out of logs.
    output = "\n".join(format_report(report))
    assert f"override [{check}]" in output
    assert "A checked false positive." not in output


@pytest.mark.parametrize(
    "path",
    [path for path in MUST_FAIL if _expected_check(path) in {"answer-exists", "accept-reasons"}],
    ids=lambda path: path.stem,
)
def test_an_override_never_covers_existence_or_reasons(path: Path, tmp_path: Path) -> None:
    document = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
    document["validator_overrides"] = [
        {"check": check, "reason": "Trying to skip it."} for check in OVERRIDABLE_CHECKS
    ]
    text = yaml.safe_dump(document, sort_keys=False)
    report = validate_content(content_with_case(tmp_path / "c", text, path.stem), SNAPSHOTS)
    assert _expected_check(path) in _checks(report)


def test_an_override_for_another_check_doesnt_cover(tmp_path: Path) -> None:
    path = CASES / "must_fail" / "symbol-unique--no-scope-stated.yaml"
    document = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
    document["validator_overrides"] = [{"check": "sequence-edges", "reason": "The wrong check."}]
    text = yaml.safe_dump(document, sort_keys=False)
    report = validate_content(content_with_case(tmp_path / "c", text, path.stem), SNAPSHOTS)
    assert _checks(report) == {"symbol-unique"}
    assert "override-unused" in _warnings(report)


def test_alternate_path_warns_without_failing(tmp_path: Path) -> None:
    report = validate_case(tmp_path, CASES / "warns" / "sequence-alternate-path.yaml")
    assert report.ok
    assert _warnings(report) == {"sequence-alternate-path"}


def test_alternate_path_override_silences_the_warning(tmp_path: Path) -> None:
    path = CASES / "warns" / "sequence-alternate-path.yaml"
    document = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
    document["validator_overrides"] = [
        {"check": "sequence-alternate-path", "reason": "The shortcut only runs in tests."}
    ]
    text = yaml.safe_dump(document, sort_keys=False)
    report = validate_content(content_with_case(tmp_path / "c", text, path.stem), SNAPSHOTS)
    assert report.ok
    assert _warnings(report) == set()


def test_duplicate_id_fails_both_files(tmp_path: Path) -> None:
    content = _copy_content(tmp_path)
    original = content / "puzzles" / "acme-widgets" / "widgets-find-002.yaml"
    other_dir = content / "puzzles" / "ghost-repo"
    other_dir.mkdir()
    shutil.copy(original, other_dir / original.name)
    report = validate_content(content, SNAPSHOTS)
    failing = [result for result in report.results if not result.passed]
    assert len(failing) == 2
    assert all("id-unique" in {f.check for f in result.errors} for result in failing)


def test_file_must_be_named_after_its_id(tmp_path: Path) -> None:
    content = _copy_content(tmp_path)
    directory = content / "puzzles" / "acme-widgets"
    (directory / "widgets-find-002.yaml").rename(directory / "renamed.yaml")
    assert _checks(validate_content(content, SNAPSHOTS)) == {"file-location"}


def test_yml_extension_cant_dodge_validation(tmp_path: Path) -> None:
    content = _copy_content(tmp_path)
    directory = content / "puzzles" / "acme-widgets"
    (directory / "widgets-find-002.yaml").rename(directory / "widgets-find-002.yml")
    assert _checks(validate_content(content, SNAPSHOTS)) == {"file-location"}


def test_file_must_be_in_its_repo_directory(tmp_path: Path) -> None:
    content = _copy_content(tmp_path)
    source = content / "puzzles" / "acme-widgets" / "widgets-find-002.yaml"
    wrong = content / "puzzles" / "ghost-repo"
    wrong.mkdir()
    source.rename(wrong / source.name)
    assert _checks(validate_content(content, SNAPSHOTS)) == {"file-location"}


def test_content_with_no_puzzles_is_an_error(tmp_path: Path) -> None:
    # Passing would let `seed` treat every puzzle in the database as removed from content.
    with pytest.raises(IngestError, match="No puzzles"):
        validate_content(tmp_path, SNAPSHOTS)


def test_unverified_puzzles_are_valid_and_reported_as_unpublished() -> None:
    report = validate_content(CONTENT, SNAPSHOTS)
    unverified = {puzzle.id for puzzle in report.puzzles if not puzzle.verified_by}
    assert {puzzle.id for puzzle in report.unpublished} == unverified
    assert "widgets-find-002" in unverified
    assert "widgets-find-001" not in unverified
    assert any(line.startswith("Unpublished") for line in format_report(report))


def test_no_message_quotes_an_answer_value(tmp_path: Path) -> None:
    """Validator output reaches CI logs, so no case may print its own key."""
    for number, path in enumerate(MUST_FAIL):
        report = validate_content(
            content_with_case(tmp_path / str(number), path.read_text(encoding="utf-8"), path.stem),
            SNAPSHOTS,
        )
        output = "\n".join(format_report(report))
        try:
            document = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError:
            continue
        answer = cast(dict[str, Any], document).get("answer", {})
        for value in _answer_strings(answer):
            assert value not in output, f"{path.stem} printed part of its key"


def _answer_strings(value: object) -> list[str]:
    if isinstance(value, dict):
        block = cast(dict[str, object], value)
        return [s for key, item in block.items() if key != "kind" for s in _answer_strings(item)]
    if isinstance(value, list):
        return [s for item in cast(list[object], value) for s in _answer_strings(item)]
    # One-letter option ids and bare numbers would match anywhere, so they prove nothing here.
    return [value] if isinstance(value, str) and len(value) > 1 else []


def test_cli_exit_code_and_counts(tmp_path: Path) -> None:
    runner = CliRunner()
    args = ["validate", "--content-dir", str(CONTENT), "--out-dir", str(SNAPSHOTS)]
    passed = runner.invoke(app, args)
    assert passed.exit_code == 0
    assert "Validated 8 puzzles: 8 passed, 0 failed." in passed.output

    bad = CASES / "must_fail" / "symbol-unique--no-scope-stated.yaml"
    content = content_with_case(tmp_path / "c", bad.read_text(encoding="utf-8"), bad.stem)
    failed = runner.invoke(
        app, ["validate", "--content-dir", str(content), "--out-dir", str(SNAPSHOTS)]
    )
    assert failed.exit_code == 1
    assert "Validated 1 puzzles: 0 passed, 1 failed." in failed.output
    assert "[symbol-unique]" in failed.output


def test_cli_missing_content_dir_is_an_error_rather_than_empty(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        app, ["validate", "--content-dir", str(tmp_path / "nope"), "--out-dir", str(SNAPSHOTS)]
    )
    assert result.exit_code == 1
