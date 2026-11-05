"""The hosted migration runner (launch checklist C7).

The planning tests need no database. The rest need INGEST_TEST_DB_URL, like the seed tests, and each
gets its own throwaway database.
"""

import os
import shutil
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo
from typer.testing import CliRunner

from ingest.cli import app
from ingest.errors import IngestError
from ingest.migrate import MIGRATIONS_DIR, Migration, load_migrations, migrate, plan_migrations
from ingest.paths import REPO_ROOT

ADMIN_URL = os.environ.get("INGEST_TEST_DB_URL")
SHIM = REPO_ROOT / "supabase" / "local" / "shim.sql"


def _migration(name: str, sha: str = "a") -> Migration:
    return Migration(name, sha, b"select 1")


# Planning, with no database.


def test_plan_lists_pending_in_order() -> None:
    files = [_migration("0001.sql"), _migration("0002.sql"), _migration("0003.sql")]
    plan = plan_migrations(files, {"0001.sql": "a"})
    assert plan.applied == ["0001.sql"]
    assert [m.name for m in plan.pending] == ["0002.sql", "0003.sql"]


def test_plan_refuses_an_edited_migration() -> None:
    with pytest.raises(IngestError, match=r"0001\.sql changed after it was applied"):
        plan_migrations([_migration("0001.sql", "new")], {"0001.sql": "old"})


def test_plan_refuses_a_gap() -> None:
    files = [_migration("0001.sql"), _migration("0002.sql")]
    with pytest.raises(IngestError, match=r"0002\.sql is applied but 0001\.sql"):
        plan_migrations(files, {"0002.sql": "a"})


def test_plan_refuses_a_database_ahead_of_the_checkout() -> None:
    with pytest.raises(IngestError, match=r"0009\.sql"):
        plan_migrations([_migration("0001.sql")], {"0001.sql": "a", "0009.sql": "a"})


def test_load_reads_the_real_migrations_in_name_order() -> None:
    names = [m.name for m in load_migrations()]
    assert names == sorted(names)
    assert names[0].startswith("0001")
    assert len({m.sha256 for m in load_migrations()}) == len(names)


def test_load_refuses_an_empty_directory(tmp_path: Path) -> None:
    with pytest.raises(IngestError, match=r"no .sql files"):
        load_migrations(tmp_path)


def test_cli_refuses_without_supabase_db_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    result = CliRunner().invoke(app, ["migrate"])
    assert result.exit_code == 1
    assert "SUPABASE_DB_URL isn't set" in result.output


# Against a real Postgres.


@pytest.fixture
def blank_url() -> Iterator[str]:
    """A throwaway database with no roles shim and no schema."""
    if ADMIN_URL is None:
        pytest.skip("INGEST_TEST_DB_URL is not set, so the database tests were skipped.")
    name = f"ingest_migrate_{uuid.uuid4().hex}"
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(
            sql.SQL("create database {} template template0 encoding 'UTF8' locale 'C'").format(
                sql.Identifier(name)
            )
        )
    try:
        yield make_conninfo(ADMIN_URL, dbname=name)
    finally:
        with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
            admin.execute(
                sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name))
            )


@pytest.fixture
def db_url(blank_url: str) -> str:
    """Like hosted Supabase before any migration: the roles and auth schema, nothing else."""
    with psycopg.connect(blank_url, autocommit=True) as connection:
        connection.execute(SHIM.read_bytes())
    return blank_url


def _scalar(url: str, query: bytes) -> Any:
    with psycopg.connect(url) as connection:
        row = connection.execute(query).fetchone()
    assert row is not None
    return row[0]


def test_applies_every_migration_then_nothing(db_url: str) -> None:
    lines: list[str] = []
    plan = migrate(db_url, lines.append)
    expected = [m.name for m in load_migrations()]
    assert [m.name for m in plan.pending] == expected
    assert lines[-len(expected) :] == [f"Applied {name}" for name in expected]
    assert _scalar(db_url, b"select count(*) from migrations.applied") == len(expected)
    assert _scalar(db_url, b"select to_regclass('public.puzzles') is not null") is True

    again: list[str] = []
    plan = migrate(db_url, again.append)
    assert plan.pending == []
    assert plan.applied == expected
    assert not any(line.startswith("Applied") for line in again)


def test_dry_run_changes_nothing(db_url: str) -> None:
    lines: list[str] = []
    plan = migrate(db_url, lines.append, dry_run=True)
    assert len(plan.pending) == len(load_migrations())
    assert any(line.startswith("Would apply 0001") for line in lines)
    assert _scalar(db_url, b"select to_regclass('public.puzzles')") is None
    assert _scalar(db_url, b"select to_regnamespace('migrations')") is None


def test_a_new_file_applies_after_the_rest(db_url: str, tmp_path: Path) -> None:
    directory = tmp_path / "migrations"
    shutil.copytree(MIGRATIONS_DIR, directory)
    migrate(db_url, lambda _: None, directory=directory)
    (directory / "9999_extra.sql").write_text("create table extra (id int);\n", encoding="utf-8")
    plan = migrate(db_url, lambda _: None, directory=directory)
    assert [m.name for m in plan.pending] == ["9999_extra.sql"]
    assert _scalar(db_url, b"select to_regclass('public.extra') is not null") is True


def test_a_failing_migration_rolls_back_and_isnt_recorded(db_url: str, tmp_path: Path) -> None:
    directory = tmp_path / "migrations"
    directory.mkdir()
    (directory / "0001_ok.sql").write_text("create table ok (id int);\n", encoding="utf-8")
    (directory / "0002_bad.sql").write_text(
        "create table half (id int);\nselect * from no_such_table;\n", encoding="utf-8"
    )
    with pytest.raises(IngestError, match="no_such_table"):
        migrate(db_url, lambda _: None, directory=directory)
    assert _scalar(db_url, b"select to_regclass('public.ok') is not null") is True
    assert _scalar(db_url, b"select to_regclass('public.half')") is None
    assert _scalar(db_url, b"select array_agg(name) from migrations.applied") == ["0001_ok.sql"]


def test_an_edited_applied_migration_stops_the_run(db_url: str, tmp_path: Path) -> None:
    directory = tmp_path / "migrations"
    directory.mkdir()
    first = directory / "0001.sql"
    first.write_text("create table one (id int);\n", encoding="utf-8")
    migrate(db_url, lambda _: None, directory=directory)
    first.write_text("create table one (id bigint);\n", encoding="utf-8")
    with pytest.raises(IngestError, match="changed after it was applied"):
        migrate(db_url, lambda _: None, directory=directory)


def test_clients_cant_read_the_tracking_table(db_url: str) -> None:
    migrate(db_url, lambda _: None)
    for role in ("anon", "authenticated"):
        query = f"select has_schema_privilege('{role}', 'migrations', 'usage')".encode()
        assert _scalar(db_url, query) is False


def test_refuses_a_database_without_supabase_roles(blank_url: str) -> None:
    with psycopg.connect(blank_url, autocommit=True) as connection:
        has_roles = connection.execute(
            b"select count(*) from pg_roles where rolname in ('anon', 'authenticated')"
        ).fetchone()
    if has_roles is not None and has_roles[0] == 2:
        pytest.skip("This server already has the Supabase roles from another database's shim.")
    with pytest.raises(IngestError, match="isn't a Supabase database"):
        migrate(blank_url, lambda _: None)


def test_refuses_a_pnpm_db_database(db_url: str) -> None:
    with psycopg.connect(db_url, autocommit=True) as connection:
        connection.execute(b"create table schema_migrations (name text primary key)")
    with pytest.raises(IngestError, match=r"localdb.mjs migrate"):
        migrate(db_url, lambda _: None)
    assert _scalar(db_url, b"select to_regnamespace('migrations')") is None


def test_cli_migrates_the_url_it_is_given(db_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_DB_URL", db_url)
    result = CliRunner().invoke(app, ["migrate", "--dry-run"])
    assert result.exit_code == 0, result.output
    assert "pending" in result.output
    assert "postgres:postgres" not in result.output
