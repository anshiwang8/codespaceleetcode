"""What write_snapshot puts on disk, the summary's numbers, and indexer setup. Runs no indexer."""

import json
from pathlib import Path

import pytest

from ingest import indexer
from ingest.convert import convert_index
from ingest.errors import IngestError
from ingest.filters import is_non_test_source
from ingest.indexer import IndexResult
from ingest.repos import Repo
from ingest.scip_parse import load_index
from ingest.summary import SnapshotSummary, summarize
from ingest.writer import read_summary, write_snapshot

FIXTURES = Path(__file__).parent / "fixtures"
REPO = FIXTURES / "tiny-python"
FILES = [
    "src/tiny/__init__.py",
    "src/tiny/core.py",
    "src/tiny/models.py",
    "tests/test_core.py",
    "top.py",
]
PYTHON_REPO = Repo("tiny-python", "https://example.test/tiny", "a" * 40, "python", "MIT")


def _read_source(rel_path: str) -> bytes | None:
    path = REPO / rel_path
    return path.read_bytes() if path.is_file() else None


def _summary() -> SnapshotSummary:
    conversion = convert_index(load_index(FIXTURES / "tiny-python.scip"), _read_source)
    return summarize(PYTHON_REPO, FILES, FILES, conversion, _read_source)


@pytest.fixture
def snapshot(tmp_path: Path) -> Path:
    conversion = convert_index(load_index(FIXTURES / "tiny-python.scip"), _read_source)
    result = IndexResult(tmp_path / "unused", "scip-python", "0.6.8")
    return write_snapshot(PYTHON_REPO, REPO, FILES, conversion, result, _summary(), tmp_path)


def test_every_occurrence_line_has_an_exclusive_end_col(snapshot: Path) -> None:
    rows = [
        json.loads(line)
        for line in (snapshot / "occurrences.jsonl").read_text("utf-8").split("\n")
        if line
    ]
    assert rows
    for row in rows:
        assert set(row) == {"symbol_id", "file", "line", "col", "end_col", "role"}
        assert row["end_col"] > row["col"] >= 1


def test_manifest_names_the_indexer_that_ran(snapshot: Path) -> None:
    manifest = json.loads((snapshot / "manifest.json").read_text("utf-8"))
    assert manifest["indexer"] == {"name": "scip-python", "version": "0.6.8"}


def test_summary_round_trips(snapshot: Path) -> None:
    assert read_summary(snapshot) == _summary()


def test_read_summary_of_a_snapshot_without_one_is_none(tmp_path: Path) -> None:
    assert read_summary(tmp_path) is None


def test_summary_counts_exclude_tests() -> None:
    summary = _summary()
    assert summary.files == 5
    assert summary.non_test_source_files == 4
    assert summary.non_test_files_indexed == 4
    assert summary.coverage == 1.0
    assert summary.non_test_symbols == summary.symbols - 1
    assert summary.edges - summary.non_test_edges == 1  # test_helper -> helper
    expected_lines = sum(
        (REPO / path).read_bytes().count(b"\n") for path in FILES if path != "tests/test_core.py"
    )
    assert summary.non_test_lines == expected_lines


def test_coverage_reports_unindexed_files() -> None:
    conversion = convert_index(load_index(FIXTURES / "tiny-python.scip"), _read_source)
    summary = summarize(PYTHON_REPO, FILES, ["top.py"], conversion, _read_source)
    assert summary.coverage == 0.25


@pytest.mark.parametrize(
    ("path", "language", "expected"),
    [
        ("src/router/index.ts", "typescript", True),
        ("lib/a.js", "typescript", True),
        ("src/a.ts", "python", False),
        ("src/requests/models.py", "python", True),
        ("src/flask/testing.py", "python", True),  # a module about tests, not a test
        ("tests/test_a.py", "python", False),
        ("pkg/test_a.py", "python", False),
        ("pkg/a_test.py", "python", False),
        ("conftest.py", "python", False),
        ("src/a.test.ts", "typescript", False),
        ("src/a.spec.tsx", "typescript", False),
        ("src/__tests__/a.ts", "typescript", False),
        ("packages/x/test/a.ts", "typescript", False),
        ("examples/a.ts", "typescript", False),
        ("docs_src/a.py", "python", False),
        ("README.md", "typescript", False),
    ],
)
def test_is_non_test_source(path: str, language: str, expected: bool) -> None:
    assert is_non_test_source(path, language) is expected


def test_missing_indexers_fail_loudly_with_install_instructions(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def not_found(_: str) -> None:
        return None

    monkeypatch.setattr(indexer.shutil, "which", not_found)
    with pytest.raises(IngestError, match="npm install -g @sourcegraph/scip-python"):
        indexer.run_indexer("python", tmp_path)
    with pytest.raises(IngestError, match="npm install -g @sourcegraph/scip-typescript"):
        indexer.run_indexer("typescript", tmp_path)


def test_unsupported_language_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(IngestError, match="No SCIP indexer"):
        indexer.run_indexer("go", tmp_path)


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


def test_src_layout_roots_are_found(tmp_path: Path) -> None:
    _touch(tmp_path / "src" / "app" / "core.py")
    _touch(tmp_path / "packages" / "lib" / "src" / "lib" / "core.py")
    _touch(tmp_path / "other" / "src" / "readme.txt")  # nothing to import
    assert indexer.python_source_roots(tmp_path) == ["packages/lib/src", "src"]


def test_a_src_that_is_itself_a_package_is_not_a_root(tmp_path: Path) -> None:
    _touch(tmp_path / "src" / "__init__.py")
    _touch(tmp_path / "src" / "core.py")
    assert indexer.python_source_roots(tmp_path) == []


def test_typescript_projects_run_deepest_first_and_end_with_a_catch_all(tmp_path: Path) -> None:
    _touch(tmp_path / "tsconfig.json")
    _touch(tmp_path / "packages" / "a" / "tsconfig.json")
    _touch(tmp_path / "packages" / "a" / "deep" / "tsconfig.json")
    _touch(tmp_path / "examples" / "demo" / "tsconfig.json")
    _touch(tmp_path / "packages" / "a" / "test" / "tsconfig.json")
    assert indexer.write_typescript_projects(tmp_path) == [
        "packages/a/deep/tsconfig.scip.json",
        "packages/a/tsconfig.scip.json",
        "tsconfig.scip.json",
        "tsconfig.scip-fallback.json",
    ]


def test_solution_style_tsconfigs_are_not_projects(tmp_path: Path) -> None:
    def write(relative: str, text: str) -> None:
        _touch(tmp_path / relative)
        (tmp_path / relative).write_text(text, encoding="utf-8")

    write("tsconfig.json", '{"compilerOptions": {"paths": {"@x/*": ["packages/*"]}}}')
    write(
        "packages/solution/tsconfig.json",
        """{
          // Only points elsewhere, with a comment and a trailing comma.
          "files": [],
          "include": [],
          "references": [{"path": "./tsconfig.build.json"},],
        }""",
    )
    write("packages/real/tsconfig.json", '{"include": ["src/**/*"], "references": [{"path": "x"}]}')
    write("packages/broken/tsconfig.json", '{"files": [')
    assert indexer.write_typescript_projects(tmp_path) == [
        "packages/broken/tsconfig.scip.json",
        "packages/real/tsconfig.scip.json",
        "tsconfig.scip.json",
        "tsconfig.scip-fallback.json",
    ]


def test_typescript_project_config_widens_scope_and_keeps_the_repos_options(
    tmp_path: Path,
) -> None:
    _touch(tmp_path / "tsconfig.json")
    indexer.write_typescript_projects(tmp_path)
    config = json.loads((tmp_path / "tsconfig.scip.json").read_text("utf-8"))
    assert config["extends"] == "./tsconfig.json"
    assert config["include"] == ["**/*"]
    assert config["files"] == []
    assert config["exclude"] == ["**/node_modules"]
    assert config["compilerOptions"]["allowJs"] is True
    fallback = json.loads((tmp_path / "tsconfig.scip-fallback.json").read_text("utf-8"))
    assert "extends" not in fallback
    assert "files" not in fallback


def test_typescript_stage_gets_a_root_package_json_only_if_it_lacks_one(tmp_path: Path) -> None:
    indexer.write_typescript_projects(tmp_path)
    assert json.loads((tmp_path / "package.json").read_text("utf-8"))["name"] == "snapshot"
    (tmp_path / "package.json").write_text('{"name": "real"}', encoding="utf-8")
    indexer.write_typescript_projects(tmp_path)
    assert json.loads((tmp_path / "package.json").read_text("utf-8"))["name"] == "real"


def test_windows_shim_ships_beside_the_indexer() -> None:
    assert Path(indexer.__file__).with_name("scip_python_windows.cjs").is_file()
