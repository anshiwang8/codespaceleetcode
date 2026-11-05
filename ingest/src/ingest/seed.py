"""Load repos, snapshots, puzzles and solutions into Postgres."""

import hashlib
import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, LiteralString

import psycopg
from psycopg import errors as pg_errors
from psycopg.conninfo import conninfo_to_dict
from psycopg.types.json import Jsonb

from ingest.errors import IngestError
from ingest.grading import is_correct
from ingest.puzzles import Answer, Puzzle, resolve_snapshot
from ingest.repos import Repo, load_repos
from ingest.snapshot_index import read_jsonl, read_manifest
from ingest.validate import Report, format_report, validate_content

# Without one, a stopped database hangs for minutes here. A connect_timeout in the URL wins.
_DEFAULT_CONNECT_TIMEOUT_SECONDS = 10

Connection = psycopg.Connection[tuple[Any, ...]]


@dataclass(frozen=True)
class SnapshotCounts:
    name: str
    files: int
    undecodable_files: int
    symbols: int
    occurrences: int
    edges: int
    seconds: float


@dataclass
class PuzzleCounts:
    inserted: int = 0
    updated: int = 0
    published: int = 0
    deleted: int = 0
    unpublished_removed: int = 0
    regraded: int = 0


def _local_db_url() -> str:
    """The `pnpm db` database, on LOCALDB_PORT like scripts/localdb.mjs."""
    raw = os.environ.get("LOCALDB_PORT", "")
    if raw == "":
        port = 54329
    elif raw.isascii() and raw.isdigit():
        port = int(raw)
    else:
        port = 0
    if not 1 <= port <= 65535:
        raise IngestError("LOCALDB_PORT must be a port number.")
    return f"postgres://postgres:postgres@localhost:{port}/codebase_puzzles"


def database_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL")
    if url is None:
        return _local_db_url()
    if not url.strip():
        raise IngestError("SUPABASE_DB_URL is set but empty. Unset it to use the local database.")
    return url


def seed_content(
    content_dir: Path, out_dir: Path, url: str, force: bool, echo: Callable[[str], None]
) -> None:
    report = validate_content(content_dir, out_dir)
    for line in format_report(report):
        echo(line)
    if not report.ok:
        raise IngestError("Validation failed, so nothing was seeded.")
    repos_path = content_dir / "repos.yaml"
    if not repos_path.is_file():
        raise IngestError(f"{repos_path} doesn't exist.")
    repos = load_repos(repos_path)

    target = describe_target(url)
    echo(f"Seeding {target}")
    try:
        timeout = conninfo_to_dict(url).get("connect_timeout", _DEFAULT_CONNECT_TIMEOUT_SECONDS)
        connection = psycopg.connect(
            url, autocommit=True, client_encoding="UTF8", connect_timeout=timeout
        )
    except psycopg.OperationalError as error:
        # Psycopg's message can echo connection details, so only the target is shown.
        raise IngestError(f"Could not connect to {target}. Is it running?") from error
    with connection:
        try:
            _require_utf8(connection, target)
            _seed(connection, repos, report, content_dir, out_dir, force, echo)
        except pg_errors.UndefinedTable as error:
            raise IngestError(f"{target} has no schema yet. Apply supabase/migrations.") from error
        except psycopg.Error as error:
            # Only the primary message: a full error's context can quote the row being written.
            detail = error.diag.message_primary or type(error).__name__
            raise IngestError(f"Database error while seeding {target}: {detail}") from error


def _require_utf8(connection: Connection, target: str) -> None:
    """Refuse up front. Otherwise the first source file with, say, an emoji fails mid-load."""
    row = connection.execute("show server_encoding").fetchone()
    encoding = row[0] if row else "unknown"
    if encoding != "UTF8":
        raise IngestError(
            f"{target} uses {encoding}, but source files need UTF8. Recreate it with UTF8 encoding "
            "(initdb --encoding=UTF8)."
        )


def _seed(
    connection: Connection,
    repos: list[Repo],
    report: Report,
    content_dir: Path,
    out_dir: Path,
    force: bool,
    echo: Callable[[str], None],
) -> None:
    loaded: list[SnapshotCounts] = []
    skipped: list[str] = []
    missing: list[str] = []
    for repo in repos:
        directory = out_dir / repo.snapshot_name
        if not directory.is_dir():
            echo(f"warning: no snapshot directory for {repo.snapshot_name}, skipping {repo.slug}.")
            missing.append(repo.slug)
            continue
        # One transaction per snapshot, so an interrupted run never leaves a partial one that a
        # later run would then skip as already loaded.
        with connection.transaction():
            counts = _load_repo(connection, repo, directory, force)
        if counts is None:
            skipped.append(repo.snapshot_name)
        else:
            loaded.append(counts)
            echo(_describe_snapshot(counts))

    with connection.transaction():
        puzzle_counts = _upsert_puzzles(connection, report.puzzles, repos, content_dir)

    echo(
        f"Snapshots: {len(loaded)} loaded, {len(skipped)} already loaded and skipped, "
        f"{len(missing)} repos with no snapshot."
    )
    echo(
        f"Puzzles: {puzzle_counts.inserted} new, {puzzle_counts.updated} updated, "
        f"{puzzle_counts.published} published. Removed from content: {puzzle_counts.deleted} "
        f"deleted, {puzzle_counts.unpublished_removed} unpublished because users have tried them."
    )
    if puzzle_counts.regraded:
        noun = "user's status" if puzzle_counts.regraded == 1 else "users' statuses"
        echo(
            f"Answer keys changed: regraded, and {puzzle_counts.regraded} {noun} changed "
            "(solved or not, or when)."
        )


def _content_hash(directory: Path) -> str:
    """Everything a load reads. The manifest holds only each file's size, so the bytes count too."""
    digest = hashlib.sha256()
    for name in ("manifest.json", "symbols.jsonl", "occurrences.jsonl", "call_edges.jsonl"):
        digest.update((directory / name).read_bytes())
    for entry in sorted(read_manifest(directory)["files"], key=lambda file: str(file["path"])):
        path = str(entry["path"])
        data = (directory / "files" / path).read_bytes()
        digest.update(f"\0{path}\0{len(data)}\0".encode())
        digest.update(data)
    return digest.hexdigest()


def _load_repo(
    connection: Connection, repo: Repo, directory: Path, force: bool
) -> SnapshotCounts | None:
    """Load one snapshot, or return None if it's already there and not forced."""
    started = time.perf_counter()
    manifest = read_manifest(directory)
    if manifest.get("sha") != repo.sha:
        raise IngestError(f"{directory}/manifest.json doesn't match the sha in repos.yaml.")

    repo_id = _fetch_id(
        connection,
        """
        insert into repos (slug, url, language, license) values (%s, %s, %s, %s)
        on conflict (slug) do update set
          url = excluded.url, language = excluded.language, license = excluded.license
        returning id
        """,
        (repo.slug, repo.url, repo.language, repo.license),
    )
    name = repo.snapshot_name
    manifest_url = f"/snapshots/{name}/manifest.json"
    content_hash = _content_hash(directory)
    row = connection.execute(
        "select id, content_hash from snapshots where name = %s", (name,)
    ).fetchone()
    if row is None:
        snapshot_id = _fetch_id(
            connection,
            """
            insert into snapshots (repo_id, sha, name, manifest_url, content_hash)
            values (%s, %s, %s, %s, %s) returning id
            """,
            (repo_id, repo.sha, name, manifest_url, content_hash),
        )
    elif not force and row[1] == content_hash:
        return None
    else:
        # Keep the snapshot row. Deleting it would cascade to puzzles and users' progress.
        snapshot_id: int = row[0]
        connection.execute("delete from files where snapshot_id = %s", (snapshot_id,))
        connection.execute("delete from call_edges where snapshot_id = %s", (snapshot_id,))
        connection.execute(
            """
            update snapshots set indexed_at = now(), manifest_url = %s, content_hash = %s
            where id = %s
            """,
            (manifest_url, content_hash, snapshot_id),
        )

    files, undecodable = _copy_files(connection, snapshot_id, directory, manifest)
    file_ids = _ids_by(connection, "select path, id from files where snapshot_id = %s", snapshot_id)
    symbols = _copy_symbols(connection, snapshot_id, directory, file_ids)
    symbol_pks = _ids_by(
        connection, "select symbol_id, id from symbols where snapshot_id = %s", snapshot_id
    )
    occurrences = _copy_occurrences(connection, directory, file_ids, symbol_pks)
    edges = _copy_edges(connection, snapshot_id, directory)
    return SnapshotCounts(
        name, files, undecodable, symbols, occurrences, edges, time.perf_counter() - started
    )


def _copy_files(
    connection: Connection, snapshot_id: int, directory: Path, manifest: dict[str, Any]
) -> tuple[int, int]:
    count = 0
    undecodable = 0
    with (
        connection.cursor() as cursor,
        cursor.copy("copy files (snapshot_id, path, size, language, content) from stdin") as copy,
    ):
        for entry in manifest["files"]:
            path = directory / "files" / entry["path"]
            if not path.is_file():
                raise IngestError(f"{path} is in the manifest but not on disk.")
            content = _file_text(path.read_bytes())
            undecodable += content is None
            copy.write_row(
                (snapshot_id, entry["path"], entry["size"], entry["language"], content or "")
            )
            count += 1
    return count, undecodable


def _file_text(data: bytes) -> str | None:
    """Return the file as text, or None if Postgres can't store it: not UTF-8, or has a NUL."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return None if "\0" in text else text


def _copy_symbols(
    connection: Connection, snapshot_id: int, directory: Path, file_ids: dict[str, int]
) -> int:
    path = directory / "symbols.jsonl"
    count = 0
    with (
        connection.cursor() as cursor,
        cursor.copy(
            """
            copy symbols (snapshot_id, file_id, symbol_id, name, kind, start_line, end_line)
            from stdin
            """
        ) as copy,
    ):
        try:
            for row in read_jsonl(path):
                copy.write_row(
                    (
                        snapshot_id,
                        file_ids[row["file"]],
                        row["symbol_id"],
                        row["name"],
                        row["kind"],
                        row["start_line"],
                        row["end_line"],
                    )
                )
                count += 1
        except KeyError as error:
            raise IngestError(f"{path} has a row with unknown or missing {error}.") from error
    return count


def _copy_occurrences(
    connection: Connection,
    directory: Path,
    file_ids: dict[str, int],
    symbol_pks: dict[str, int],
) -> int:
    path = directory / "occurrences.jsonl"
    count = 0
    with (
        connection.cursor() as cursor,
        cursor.copy(
            "copy occurrences (symbol_pk, file_id, line, col, end_col, role) from stdin"
        ) as copy,
    ):
        try:
            for row in read_jsonl(path):
                copy.write_row(
                    (
                        symbol_pks[row["symbol_id"]],
                        file_ids[row["file"]],
                        row["line"],
                        row["col"],
                        row["end_col"],
                        row["role"],
                    )
                )
                count += 1
        except KeyError as error:
            raise IngestError(
                f"{path} has a row with unknown or missing {error}. If that's end_col, the "
                "snapshot predates it, so re-run `uv run python -m ingest snapshot`."
            ) from error
    return count


def _copy_edges(connection: Connection, snapshot_id: int, directory: Path) -> int:
    count = 0
    with (
        connection.cursor() as cursor,
        cursor.copy(
            "copy call_edges (snapshot_id, caller_symbol_id, callee_symbol_id) from stdin"
        ) as copy,
    ):
        for row in read_jsonl(directory / "call_edges.jsonl"):
            copy.write_row((snapshot_id, row["caller_symbol_id"], row["callee_symbol_id"]))
            count += 1
    return count


def _upsert_puzzles(
    connection: Connection, puzzles: list[Puzzle], repos: list[Repo], content_dir: Path
) -> PuzzleCounts:
    counts = PuzzleCounts()
    snapshot_ids: dict[str, int] = {
        row[0]: row[1] for row in connection.execute("select name, id from snapshots")
    }
    for puzzle in puzzles:
        repo = resolve_snapshot(puzzle.snapshot, repos)
        if repo is None or repo.snapshot_name not in snapshot_ids:
            raise IngestError(f"{puzzle.id}: its snapshot isn't in the database after loading.")
        published = bool(puzzle.verified_by)
        previous = connection.execute(
            "select answer_json from puzzles where slug = %s", (puzzle.id,)
        ).fetchone()
        row = connection.execute(
            """
            insert into puzzles (
              snapshot_id, slug, type, difficulty, title, prompt, answer_kind, answer_json,
              set_count, choices, hints, tags, verified_by, published
            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (slug) do update set
              snapshot_id = excluded.snapshot_id,
              type = excluded.type,
              difficulty = excluded.difficulty,
              title = excluded.title,
              prompt = excluded.prompt,
              answer_kind = excluded.answer_kind,
              answer_json = excluded.answer_json,
              set_count = excluded.set_count,
              choices = excluded.choices,
              hints = excluded.hints,
              tags = excluded.tags,
              verified_by = excluded.verified_by,
              published = excluded.published
            returning id, (xmax = 0)
            """,
            (
                snapshot_ids[repo.snapshot_name],
                puzzle.id,
                puzzle.type,
                puzzle.difficulty,
                puzzle.title,
                puzzle.prompt,
                puzzle.answer.kind,
                Jsonb(puzzle.answer_block),
                puzzle.set_count,
                None
                if puzzle.choices is None
                else Jsonb([{"id": c.id, "label": c.label} for c in puzzle.choices]),
                Jsonb(list(puzzle.hints)),
                list(puzzle.tags),
                list(puzzle.verified_by),
                published,
            ),
        ).fetchone()
        assert row is not None
        puzzle_id, inserted = row
        counts.inserted += inserted
        counts.updated += not inserted
        if previous is not None and previous[0] != json.loads(json.dumps(puzzle.answer_block)):
            counts.regraded += _regrade(connection, puzzle_id, puzzle.answer)
        counts.published += published
        body = (content_dir / puzzle.solution).read_text(encoding="utf-8")
        connection.execute(
            """
            insert into solutions (puzzle_id, body_md) values (%s, %s)
            on conflict (puzzle_id) do update set body_md = excluded.body_md
            """,
            (puzzle_id, body),
        )
    _remove_absent_puzzles(connection, [puzzle.id for puzzle in puzzles], counts)
    return counts


def _regrade(connection: Connection, puzzle_id: int, answer: Answer) -> int:
    """After a key change, recompute each user's status from their submissions under the new key.

    A user is solved if any submission is correct now, and their solve dates from the first such
    one. Submissions keep their recorded `correct`, which says how they were graded at the time.
    Returns how many users' status or solve time changed.
    """
    changed = 0
    users = connection.execute(
        "select user_id, status, solved_at from progress where puzzle_id = %s", (puzzle_id,)
    ).fetchall()
    for user_id, status, solved_at in users:
        submissions = connection.execute(
            """
            select answer_json, created_at from submissions
             where puzzle_id = %s and user_id = %s order by created_at, id
            """,
            (puzzle_id, user_id),
        ).fetchall()
        first_correct = next(
            (created for body, created in submissions if is_correct(answer, body)), None
        )
        new_status = "solved" if first_correct is not None else "attempted"
        if status == "solved" and new_status == "solved":
            first_correct = solved_at  # Still solved: keep the date they solved it.
        if (new_status, first_correct) == (status, solved_at):
            continue
        connection.execute(
            "update progress set status = %s, solved_at = %s where puzzle_id = %s and user_id = %s",
            (new_status, first_correct, puzzle_id, user_id),
        )
        changed += 1
    return changed


def _remove_absent_puzzles(connection: Connection, slugs: list[str], counts: PuzzleCounts) -> None:
    """Delete puzzles gone from content, except ones users have tried, which only get unpublished.

    A progress row with no submission (the removed give-up feature left these) still counts as
    tried, since deleting the puzzle would cascade to that row.
    """
    absent = connection.execute(
        """
        select p.id,
          exists (select 1 from submissions s where s.puzzle_id = p.id)
          or exists (select 1 from progress r where r.puzzle_id = p.id)
        from puzzles p
        where not (p.slug = any(%s::text[]))
        """,
        (slugs,),
    ).fetchall()
    for puzzle_id, tried in absent:
        if tried:
            connection.execute("update puzzles set published = false where id = %s", (puzzle_id,))
            counts.unpublished_removed += 1
        else:
            connection.execute("delete from puzzles where id = %s", (puzzle_id,))
            counts.deleted += 1


def _fetch_id(connection: Connection, query: LiteralString, parameters: tuple[object, ...]) -> int:
    row = connection.execute(query, parameters).fetchone()
    assert row is not None
    return row[0]


def _ids_by(connection: Connection, query: LiteralString, snapshot_id: int) -> dict[str, int]:
    rows = connection.execute(query, (snapshot_id,))
    return {row[0]: row[1] for row in rows}


def _describe_snapshot(counts: SnapshotCounts) -> str:
    return (
        f"Loaded {counts.name}: {counts.files} files ({counts.undecodable_files} stored empty as "
        f"non-text), {counts.symbols} symbols, {counts.occurrences} occurrences, {counts.edges} "
        f"edges, in {counts.seconds:.1f}s."
    )


def describe_target(url: str) -> str:
    """Where we're connecting, without the password."""
    try:
        info = conninfo_to_dict(url)
    except psycopg.ProgrammingError as error:
        raise IngestError("The database URL isn't valid.") from error
    return f"{info.get('host', 'localhost')}:{info.get('port', '5432')}/{info.get('dbname', '')}"
