"""Seed against a real Postgres. Each test gets its own throwaway database.

Set INGEST_TEST_DB_URL to any database on a server you can create databases on. It's deliberately
not SUPABASE_DB_URL: the database it names is only used to create and drop the throwaway ones.
"""

import json
import os
import shutil
import uuid
from collections.abc import Generator, Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from puzzle_fixtures import CONTENT, SHA, SNAPSHOT_NAME, SNAPSHOTS
from typer.testing import CliRunner

from ingest.cli import app
from ingest.errors import IngestError
from ingest.paths import REPO_ROOT
from ingest.seed import LOCAL_DB_URL, database_url, seed_content

ADMIN_URL = os.environ.get("INGEST_TEST_DB_URL")
SKIP_REASON = (
    "INGEST_TEST_DB_URL is not set, so the seed tests need a real Postgres and were skipped. "
    "Start one with `pnpm db` and set it to its connection URL."
)
AUTH_USER = "00000000-0000-0000-0000-000000000001"

Connection = psycopg.Connection[tuple[Any, ...]]


@pytest.fixture
def db_url() -> Iterator[str]:
    if ADMIN_URL is None:
        pytest.skip(SKIP_REASON)
    name = f"ingest_test_{uuid.uuid4().hex}"
    yield from _throwaway_database(ADMIN_URL, name, "UTF8")


def _throwaway_database(admin_url: str, name: str, encoding: str) -> Generator[str]:
    # template0 and locale C allow any encoding, whatever the server's own default is.
    create = sql.SQL("create database {} template template0 encoding {} locale 'C'").format(
        sql.Identifier(name), sql.Literal(encoding)
    )
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(create)
    url = make_conninfo(admin_url, dbname=name)
    try:
        with psycopg.connect(url, autocommit=True) as connection:
            _apply_schema(connection)
        yield url
    finally:
        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(
                sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name))
            )


def _apply_schema(connection: Connection) -> None:
    files = [
        REPO_ROOT / "supabase" / "local" / "shim.sql",
        *sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql")),
    ]
    for path in files:
        connection.execute(path.read_text(encoding="utf-8").encode("utf-8"))


def _seed(
    url: str, content: Path = CONTENT, out: Path = SNAPSHOTS, force: bool = False
) -> list[str]:
    lines: list[str] = []
    seed_content(content, out, url, force, lines.append)
    return lines


def _one(url: str, query: bytes, *parameters: object) -> Any:
    with psycopg.connect(url) as connection:
        # None, not (), so a literal % in a query with no parameters isn't read as a placeholder.
        row = connection.execute(query, parameters or None).fetchone()
    assert row is not None
    return row[0]


def _rows(url: str, query: bytes, *parameters: object) -> list[tuple[Any, ...]]:
    with psycopg.connect(url) as connection:
        return connection.execute(query, parameters or None).fetchall()


def _copy_content(tmp_path: Path) -> Path:
    target = tmp_path / "content"
    shutil.copytree(CONTENT, target)
    return target


def _add_user_activity(url: str, slug: str, submission: bool = True) -> None:
    """Record a user who tried a puzzle: a submission and progress, or a bare give-up."""
    with psycopg.connect(url) as connection:
        row = connection.execute(b"select id from puzzles where slug = %s", (slug,)).fetchone()
        assert row is not None
        connection.execute(
            b"insert into auth.users (id) values (%s) on conflict do nothing", (AUTH_USER,)
        )
        connection.execute(
            b"insert into users (id, github_login) values (%s, 'dev') on conflict do nothing",
            (AUTH_USER,),
        )
        if submission:
            connection.execute(
                b"insert into submissions (user_id, puzzle_id, answer_json, correct) "
                b"values (%s, %s, '{}', false)",
                (AUTH_USER, row[0]),
            )
        connection.execute(
            b"insert into progress (user_id, puzzle_id, status, attempts) "
            b"values (%s, %s, 'attempted', 1)",
            (AUTH_USER, row[0]),
        )


def test_first_seed_loads_repos_and_the_snapshot(db_url: str) -> None:
    lines = _seed(db_url)

    assert _rows(db_url, b"select slug, url, language, license from repos") == [
        ("acme-widgets", "https://example.test/acme/widgets", "javascript", "MIT")
    ]
    assert _rows(db_url, b"select sha, name, manifest_url from snapshots") == [
        (SHA, SNAPSHOT_NAME, f"/snapshots/{SNAPSHOT_NAME}/manifest.json")
    ]
    assert _one(db_url, b"select count(*) from files") == 12
    assert _one(db_url, b"select count(*) from symbols") == 30
    assert _one(db_url, b"select count(*) from occurrences") == 31
    assert _one(db_url, b"select count(*) from call_edges") == 11
    assert any("Puzzles: 8 new, 0 updated, 3 published." in line for line in lines)


def test_ghost_repo_with_no_snapshot_directory_is_warned_about_and_skipped(db_url: str) -> None:
    lines = _seed(db_url)
    assert any(line.startswith("warning:") and "ghost-repo" in line for line in lines)
    assert _one(db_url, b"select count(*) from repos where slug = 'ghost-repo'") == 0


def test_file_contents_keep_their_bytes_and_non_utf8_is_stored_empty(db_url: str) -> None:
    _seed(db_url)
    source = SNAPSHOTS / SNAPSHOT_NAME / "files" / "src" / "app.js"
    assert (
        _one(db_url, b"select content from files where path = 'src/app.js'")
        == source.read_bytes().decode()
    )
    assert _rows(
        db_url, b"select content, size, language from files where path like 'assets/%'"
    ) == [("", 5, "other")]


def test_any_unicode_and_line_endings_survive_exactly(db_url: str, tmp_path: Path) -> None:
    out = tmp_path / "out"
    shutil.copytree(SNAPSHOTS, out)
    text = "﻿const s = '✨ 日本語 \U0001f600';\r\n"
    (out / SNAPSHOT_NAME / "files" / "src" / "app.js").write_bytes(text.encode("utf-8"))
    _seed(db_url, out=out)
    assert _one(db_url, b"select content from files where path = 'src/app.js'") == text


def test_refuses_a_database_that_isnt_utf8(tmp_path: Path) -> None:
    if ADMIN_URL is None:
        pytest.skip(SKIP_REASON)
    name = f"ingest_test_{uuid.uuid4().hex}"
    databases = _throwaway_database(ADMIN_URL, name, "WIN1252")
    url = next(databases)
    try:
        with pytest.raises(IngestError, match="uses WIN1252"):
            _seed(url)
        assert _one(url, b"select count(*) from repos") == 0
    finally:
        databases.close()


def test_a_database_error_is_a_plain_message(db_url: str) -> None:
    with psycopg.connect(db_url, autocommit=True) as connection:
        connection.execute(b"alter table symbols add check (name <> 'handle')")
    with pytest.raises(IngestError, match="Database error while seeding"):
        _seed(db_url)
    assert _one(db_url, b"select count(*) from snapshots") == 0


def test_a_nul_byte_keeps_the_row_with_empty_content(db_url: str, tmp_path: Path) -> None:
    out = tmp_path / "out"
    shutil.copytree(SNAPSHOTS, out)
    (out / SNAPSHOT_NAME / "files" / "assets" / "latin1.txt").write_bytes(b"ok\x00ok\n")
    _seed(db_url, out=out)
    assert _one(db_url, b"select content from files where path = 'assets/latin1.txt'") == ""


def test_symbols_and_occurrences_link_to_the_right_rows(db_url: str) -> None:
    _seed(db_url)
    assert _rows(
        db_url,
        b"""
        select f.path, s.name, s.kind, s.start_line, s.end_line
        from symbols s join files f on f.id = s.file_id
        where s.symbol_id = 'src/app.js#App.handle'
        """,
    ) == [("src/app.js", "handle", "method", 3, 3)]
    assert _rows(
        db_url,
        b"""
        select f.path, o.line, o.col, o.end_col, o.role
        from occurrences o
        join symbols s on s.id = o.symbol_pk
        join files f on f.id = o.file_id
        where s.symbol_id = 'src/app.js#App.handle'
        order by o.line
        """,
    ) == [
        ("src/app.js", 2, 27, 33, "reference"),
        ("src/app.js", 3, 3, 9, "definition"),
    ]


def test_puzzle_fields(db_url: str) -> None:
    _seed(db_url)
    assert _rows(
        db_url,
        b"""
        select type, difficulty, title, answer_kind, set_count, hints, tags, verified_by, published
        from puzzles where slug = 'widgets-find-001'
        """,
    ) == [
        (
            "find",
            "easy",
            "Fixture widgets-find-001",
            "symbol",
            None,
            ["FIXTURE-HINT Routes are matched layer by layer."],
            ["routing", "http"],
            ["anshi"],
            True,
        )
    ]
    assert _one(db_url, b"select answer_json from puzzles where slug = 'widgets-find-001'") == {
        "kind": "symbol",
        "id": "src/router/layer.js#Layer.match",
        "accept": [],
        "accept_reasons": [],
    }


def test_answer_json_writes_out_omitted_optional_lists(db_url: str) -> None:
    _seed(db_url)
    assert _one(db_url, b"select answer_json from puzzles where slug = 'widgets-find-002'") == {
        "kind": "symbol",
        "id": "src/legacy/view.js#View.render",
        "accept": [],
        "accept_reasons": [],
    }
    assert _one(db_url, b"select answer_json from puzzles where slug = 'widgets-find-004'") == {
        "kind": "location",
        "path": "src/config.js",
        "anchor": [10, 12],
        "window": [8, 20],
    }


def test_published_needs_verified_by(db_url: str) -> None:
    _seed(db_url)
    published = {row[0] for row in _rows(db_url, b"select slug from puzzles where published")}
    assert published == {"widgets-find-001", "widgets-trace-001", "widgets-architecture-002"}


def test_set_count_and_choices(db_url: str) -> None:
    _seed(db_url)
    assert (
        _one(db_url, b"select set_count from puzzles where slug = 'widgets-architecture-001'") == 3
    )
    choices = _one(db_url, b"select choices from puzzles where slug = 'widgets-architecture-002'")
    assert [option["id"] for option in choices] == ["a", "b", "c"]
    assert all(set(option) == {"id", "label"} for option in choices)
    assert _one(db_url, b"select choices from puzzles where slug = 'widgets-find-001'") is None


def test_solutions_are_loaded(db_url: str) -> None:
    _seed(db_url)
    assert _one(db_url, b"select count(*) from solutions") == 8
    assert "FIXTURE-SOLUTION" in _one(
        db_url,
        b"select body_md from solutions s join puzzles p on p.id = s.puzzle_id "
        b"where p.slug = 'widgets-find-003'",
    )


def test_reseed_skips_the_snapshot_and_keeps_progress(db_url: str) -> None:
    _seed(db_url)
    file_ids = _rows(db_url, b"select id from files order by id")
    puzzle_ids = _rows(db_url, b"select id, slug from puzzles order by id")
    _add_user_activity(db_url, "widgets-find-001")

    lines = _seed(db_url)

    assert any("0 loaded, 1 already loaded and skipped" in line for line in lines)
    assert any("Puzzles: 0 new, 8 updated, 3 published." in line for line in lines)
    assert _rows(db_url, b"select id from files order by id") == file_ids
    assert _rows(db_url, b"select id, slug from puzzles order by id") == puzzle_ids
    assert _one(db_url, b"select count(*) from submissions") == 1
    assert _one(db_url, b"select count(*) from progress") == 1


def test_reseed_picks_up_edited_puzzles_and_solutions(db_url: str, tmp_path: Path) -> None:
    _seed(db_url)
    puzzle_id = _one(db_url, b"select id from puzzles where slug = 'widgets-find-003'")
    content = _copy_content(tmp_path)
    path = content / "puzzles" / "acme-widgets" / "widgets-find-003.yaml"
    text = path.read_text(encoding="utf-8")
    path.write_text(
        text.replace("Default timeout", "New title").replace(
            "verified_by: []", "verified_by: [bo]"
        ),
        encoding="utf-8",
    )
    (content / "solutions" / "widgets-find-003.md").write_text("Rewritten.\n", encoding="utf-8")

    _seed(db_url, content)

    assert _rows(
        db_url, b"select id, title, published from puzzles where slug = 'widgets-find-003'"
    ) == [(puzzle_id, "New title", True)]
    assert _one(db_url, b"select body_md from solutions where puzzle_id = %s", puzzle_id) == (
        "Rewritten.\n"
    )


def test_force_reloads_the_snapshot_without_touching_puzzles_or_progress(
    db_url: str, tmp_path: Path
) -> None:
    _seed(db_url)
    snapshot_id = _one(db_url, b"select id from snapshots")
    puzzle_id = _one(db_url, b"select id from puzzles where slug = 'widgets-find-001'")
    old_file_ids = _rows(db_url, b"select id from files order by id")
    _add_user_activity(db_url, "widgets-find-001")

    out = tmp_path / "out"
    shutil.copytree(SNAPSHOTS, out)
    (out / SNAPSHOT_NAME / "files" / "src" / "app.js").write_bytes(b"changed\n")
    without_force = _seed(db_url, out=out)
    assert any("1 already loaded and skipped" in line for line in without_force)
    assert "changed" not in _one(db_url, b"select content from files where path = 'src/app.js'")

    forced = _seed(db_url, out=out, force=True)

    assert any("1 loaded" in line for line in forced)
    assert _one(db_url, b"select content from files where path = 'src/app.js'") == "changed\n"
    assert _one(db_url, b"select id from snapshots") == snapshot_id
    assert _rows(db_url, b"select id from files order by id") != old_file_ids
    assert _one(db_url, b"select count(*) from files") == 12
    assert _one(db_url, b"select count(*) from symbols") == 30
    assert _one(db_url, b"select count(*) from occurrences") == 31
    assert _one(db_url, b"select count(*) from call_edges") == 11
    assert _one(db_url, b"select id from puzzles where slug = 'widgets-find-001'") == puzzle_id
    assert _one(db_url, b"select count(*) from submissions") == 1
    assert _one(db_url, b"select count(*) from progress") == 1


def test_removed_puzzle_nobody_tried_is_deleted(db_url: str, tmp_path: Path) -> None:
    _seed(db_url)
    content = _copy_content(tmp_path)
    (content / "puzzles" / "acme-widgets" / "widgets-find-002.yaml").unlink()
    (content / "solutions" / "widgets-find-002.md").unlink()

    lines = _seed(db_url, content)

    assert any("1 deleted, 0 unpublished" in line for line in lines)
    assert _one(db_url, b"select count(*) from puzzles where slug = 'widgets-find-002'") == 0


def test_removed_puzzle_with_a_submission_is_unpublished(db_url: str, tmp_path: Path) -> None:
    _seed(db_url)
    _add_user_activity(db_url, "widgets-find-001")
    content = _copy_content(tmp_path)
    (content / "puzzles" / "acme-widgets" / "widgets-find-001.yaml").unlink()

    lines = _seed(db_url, content)

    assert any("0 deleted, 1 unpublished" in line for line in lines)
    assert _one(db_url, b"select published from puzzles where slug = 'widgets-find-001'") is False
    assert _one(db_url, b"select count(*) from submissions") == 1
    assert _one(db_url, b"select count(*) from progress") == 1


def test_removed_puzzle_with_only_progress_keeps_that_progress(db_url: str, tmp_path: Path) -> None:
    _seed(db_url)
    _add_user_activity(db_url, "widgets-find-001", submission=False)
    content = _copy_content(tmp_path)
    (content / "puzzles" / "acme-widgets" / "widgets-find-001.yaml").unlink()

    _seed(db_url, content)

    assert _one(db_url, b"select published from puzzles where slug = 'widgets-find-001'") is False
    assert _one(db_url, b"select count(*) from progress") == 1


def test_refuses_when_validation_fails_and_writes_nothing(db_url: str, tmp_path: Path) -> None:
    content = _copy_content(tmp_path)
    path = content / "puzzles" / "acme-widgets" / "widgets-find-002.yaml"
    path.write_text(
        path.read_text(encoding="utf-8").replace("View.render", "View.noSuchMethod"),
        encoding="utf-8",
    )
    with pytest.raises(IngestError, match="nothing was seeded"):
        _seed(db_url, content)
    assert _one(db_url, b"select count(*) from repos") == 0
    assert _one(db_url, b"select count(*) from puzzles") == 0


def test_snapshot_without_end_col_fails_and_leaves_no_partial_snapshot(
    db_url: str, tmp_path: Path
) -> None:
    out = tmp_path / "out"
    shutil.copytree(SNAPSHOTS, out)
    occurrences = out / SNAPSHOT_NAME / "occurrences.jsonl"
    rows = [json.loads(line) for line in occurrences.read_text(encoding="utf-8").splitlines()]
    for row in rows:
        del row["end_col"]
    occurrences.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")

    with pytest.raises(IngestError, match="end_col"):
        _seed(db_url, out=out)

    assert _one(db_url, b"select count(*) from snapshots") == 0
    assert _one(db_url, b"select count(*) from files") == 0


def test_manifest_with_another_sha_is_refused(db_url: str, tmp_path: Path) -> None:
    out = tmp_path / "out"
    shutil.copytree(SNAPSHOTS, out)
    manifest = out / SNAPSHOT_NAME / "manifest.json"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    data["sha"] = "c" * 40
    manifest.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(IngestError, match="sha"):
        _seed(db_url, out=out)


def test_cli_uses_supabase_db_url(db_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_DB_URL", db_url)
    result = CliRunner().invoke(
        app, ["seed", "--content-dir", str(CONTENT), "--out-dir", str(SNAPSHOTS)]
    )
    assert result.exit_code == 0, result.output
    assert "Validated 8 puzzles: 8 passed, 0 failed." in result.output
    assert _one(db_url, b"select count(*) from puzzles") == 8


def test_output_never_shows_the_password(db_url: str) -> None:
    password = conninfo_to_dict(db_url).get("password")
    assert password
    assert not any(str(password) in line for line in _seed(db_url))


def test_database_url_defaults_only_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    assert database_url() == LOCAL_DB_URL
    monkeypatch.setenv("SUPABASE_DB_URL", "postgres://elsewhere/db")
    assert database_url() == "postgres://elsewhere/db"
    monkeypatch.setenv("SUPABASE_DB_URL", "")
    with pytest.raises(IngestError, match="empty"):
        database_url()


def test_unreachable_database_is_a_clear_error_without_the_password() -> None:
    # The short timeout keeps this quick, as it runs even with no database configured.
    url = "postgres://user:s3cret-value@127.0.0.1:1/none?connect_timeout=2"
    with pytest.raises(IngestError) as caught:
        _seed(url)
    assert "s3cret-value" not in str(caught.value)
    assert "Could not connect" in str(caught.value)


def test_a_rebuilt_snapshot_reloads_without_force(db_url: str, tmp_path: Path) -> None:
    out = tmp_path / "out"
    shutil.copytree(SNAPSHOTS, out)
    _seed(db_url, out=out)

    # A snapshot's SHA stays the same when the pipeline improves, but its index changes.
    symbols = next(path for path in out.glob("*/symbols.jsonl"))
    lines = symbols.read_text(encoding="utf-8").splitlines()
    first = json.loads(lines[0])
    first["end_line"] += 1
    lines[0] = json.dumps(first)
    symbols.write_text("\n".join(lines) + "\n", encoding="utf-8")

    _seed(db_url, out=out)
    assert (
        _one(db_url, b"select end_line from symbols where symbol_id = %s", first["symbol_id"])
        == first["end_line"]
    )
