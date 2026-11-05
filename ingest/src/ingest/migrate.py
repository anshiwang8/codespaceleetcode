"""Apply supabase/migrations to a hosted database, in order, once each (launch checklist C7).

Locally, `scripts/localdb.mjs` does this for the `pnpm db` database with its own tracking table.
This one is for hosted Supabase. It records each applied file with its SHA-256 in
`migrations.applied`, a schema clients can't reach, and refuses to go on if an applied file has
since changed (CLAUDE.md: never edit an applied migration).
"""

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg
from psycopg.conninfo import conninfo_to_dict

from ingest.errors import IngestError
from ingest.paths import REPO_ROOT
from ingest.seed import describe_target

MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
_CONNECT_TIMEOUT_SECONDS = 10
# Any fixed number works; it only has to be the same for every run of this command.
_LOCK_KEY = 0x6D696772617465  # "migrate"

Connection = psycopg.Connection[tuple[Any, ...]]

_TRACKING_SQL = b"""
create schema if not exists migrations;
revoke all on schema migrations from public;
create table if not exists migrations.applied (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);
revoke all on migrations.applied from public;
"""


@dataclass(frozen=True)
class Migration:
    name: str
    sha256: str
    sql: bytes


@dataclass
class MigrationPlan:
    applied: list[str]
    pending: list[Migration]


def load_migrations(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    """Every .sql file in the directory, sorted by name, which is the order they apply in."""
    if not directory.is_dir():
        raise IngestError(f"{directory} doesn't exist.")
    migrations: list[Migration] = []
    for path in sorted(directory.glob("*.sql")):
        data = path.read_bytes()
        migrations.append(Migration(path.name, hashlib.sha256(data).hexdigest(), data))
    if not migrations:
        raise IngestError(f"{directory} has no .sql files.")
    return migrations


def plan_migrations(migrations: list[Migration], recorded: dict[str, str]) -> MigrationPlan:
    """What's applied and what's left, or an error if the database and the files disagree."""
    names = {migration.name for migration in migrations}
    unknown = sorted(set(recorded) - names)
    if unknown:
        raise IngestError(
            f"The database has migrations this checkout doesn't: {', '.join(unknown)}. "
            "Pull the latest main before migrating."
        )
    applied: list[str] = []
    pending: list[Migration] = []
    for migration in migrations:
        sha = recorded.get(migration.name)
        if sha is None:
            pending.append(migration)
            continue
        if pending:
            raise IngestError(
                f"{migration.name} is applied but {pending[0].name}, which sorts before it, "
                "isn't. Migrations must apply in order; add a new file with a later number."
            )
        if sha != migration.sha256:
            raise IngestError(
                f"{migration.name} changed after it was applied. Never edit an applied "
                "migration; put the change in a new one."
            )
        applied.append(migration.name)
    return MigrationPlan(applied, pending)


def migrate(
    url: str,
    echo: Callable[[str], None],
    *,
    dry_run: bool = False,
    directory: Path = MIGRATIONS_DIR,
) -> MigrationPlan:
    """Applies every pending migration, each in its own transaction, and returns the plan."""
    migrations = load_migrations(directory)
    target = describe_target(url)
    try:
        timeout = conninfo_to_dict(url).get("connect_timeout", _CONNECT_TIMEOUT_SECONDS)
        connection = psycopg.connect(url, autocommit=True, connect_timeout=timeout)
    except psycopg.OperationalError as error:
        # Psycopg's message can echo connection details, so only the target is shown.
        raise IngestError(f"Could not connect to {target}. Is it running?") from error
    with connection:
        try:
            return _migrate(connection, target, migrations, echo, dry_run)
        except psycopg.Error as error:
            detail = error.diag.message_primary or type(error).__name__
            raise IngestError(f"Database error while migrating {target}: {detail}") from error


def _migrate(
    connection: Connection,
    target: str,
    migrations: list[Migration],
    echo: Callable[[str], None],
    dry_run: bool,
) -> MigrationPlan:
    _require_supabase_roles(connection, target)
    _refuse_local_database(connection, target)
    # Two runs at once would both see the same file as pending. The second waits here instead.
    connection.execute(b"select pg_advisory_lock(%s)", (_LOCK_KEY,))
    try:
        recorded = _recorded(connection, create=not dry_run)
        plan = plan_migrations(migrations, recorded)
        echo(f"{target}: {len(plan.applied)} applied, {len(plan.pending)} pending.")
        for migration in plan.pending:
            if dry_run:
                echo(f"Would apply {migration.name}")
                continue
            with connection.transaction():
                connection.execute(migration.sql)
                connection.execute(
                    b"insert into migrations.applied (name, sha256) values (%s, %s)",
                    (migration.name, migration.sha256),
                )
            echo(f"Applied {migration.name}")
        return plan
    finally:
        connection.execute(b"select pg_advisory_unlock(%s)", (_LOCK_KEY,))


def _require_supabase_roles(connection: Connection, target: str) -> None:
    row = connection.execute(
        b"select count(*) from pg_roles where rolname in ('anon', 'authenticated')"
    ).fetchone()
    if row is None or row[0] != 2:
        raise IngestError(
            f"{target} has no anon and authenticated roles, so it isn't a Supabase database. "
            "The migrations grant to those roles."
        )


def _refuse_local_database(connection: Connection, target: str) -> None:
    row = connection.execute(b"select to_regclass('public.schema_migrations')").fetchone()
    if row is not None and row[0] is not None:
        raise IngestError(
            f"{target} is a `pnpm db` database, which scripts/localdb.mjs migrates with its own "
            "table. Use `node scripts/localdb.mjs migrate` there."
        )


def _recorded(connection: Connection, *, create: bool) -> dict[str, str]:
    if create:
        connection.execute(_TRACKING_SQL)
    else:
        row = connection.execute(b"select to_regclass('migrations.applied')").fetchone()
        if row is None or row[0] is None:
            return {}
    rows = connection.execute(b"select name, sha256 from migrations.applied").fetchall()
    return {str(name): str(sha) for name, sha in rows}
