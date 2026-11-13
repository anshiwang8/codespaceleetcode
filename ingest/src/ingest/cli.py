"""The `ingest` command line."""

import os
from collections import Counter
from pathlib import Path
from typing import Annotated

import typer

from ingest import paths
from ingest.blind import check_answers, export_puzzles, write_export
from ingest.convert import Conversion, convert_index
from ingest.errors import IngestError
from ingest.fetch import fetch_repo
from ingest.filters import filter_tree
from ingest.indexer import run_indexer, stage_files
from ingest.lessons import format_lesson_report, validate_lessons, write_generated
from ingest.migrate import migrate as run_migrations
from ingest.puzzles import CONTENT_DIR
from ingest.repos import Repo, find_repo, load_repos
from ingest.scip_parse import load_index, normalize_path
from ingest.seed import database_url, seed_content
from ingest.summary import SnapshotSummary, summarize
from ingest.upload import ObjectStore, describe_upload_error, r2_store_from_env, upload_snapshot
from ingest.validate import format_report, validate_content
from ingest.writer import read_summary, write_snapshot

app = typer.Typer(no_args_is_help=True, add_completion=False)

ContentDirOption = Annotated[Path, typer.Option("--content-dir", help="The content/ directory.")]
OutDirOption = Annotated[Path, typer.Option("--out-dir", help="Where snapshots were written.")]


@app.command()
def snapshot(slug: str) -> None:
    """Fetch a repo at its pinned SHA, filter, index, and write a local snapshot."""
    try:
        _snapshot(find_repo(paths.REPOS_YAML, slug))
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


@app.command()
def seed(
    content_dir: ContentDirOption = CONTENT_DIR,
    out_dir: OutDirOption = paths.OUT_DIR,
    force: Annotated[
        bool, typer.Option("--force", help="Reload snapshots that are already loaded.")
    ] = False,
) -> None:
    """Validate content/, then load repos, snapshots, puzzles and solutions into Postgres.

    Uses SUPABASE_DB_URL, or the local database if that's unset.
    """
    try:
        seed_content(content_dir, out_dir, database_url(), force, typer.echo)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


@app.command()
def migrate(
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="List pending migrations without applying them.")
    ] = False,
) -> None:
    """Apply pending supabase/migrations to SUPABASE_DB_URL, in order, once each.

    Run it with the hosted URL loaded: `uv run --env-file .env python -m ingest migrate`.
    """
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    try:
        if not url:
            raise IngestError(
                "SUPABASE_DB_URL isn't set. This command is for the hosted database; locally, "
                "`pnpm db` applies migrations."
            )
        run_migrations(url, typer.echo, dry_run=dry_run)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


@app.command()
def validate(
    content_dir: ContentDirOption = CONTENT_DIR, out_dir: OutDirOption = paths.OUT_DIR
) -> None:
    """Run the checks in spec section 6 on every puzzle, and the Learn path's checks on every lesson."""
    try:
        report = validate_content(content_dir, out_dir)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error
    for line in format_report(report):
        typer.echo(line)
    lessons = validate_lessons(content_dir)
    for line in format_lesson_report(lessons):
        typer.echo(line)
    if not report.ok or not lessons.ok:
        raise typer.Exit(code=1)


@app.command()
def learn(content_dir: ContentDirOption = CONTENT_DIR) -> None:
    """Check content/lessons/ and write the Learn path's public and server-only TypeScript files."""
    report = write_generated(content_dir)
    for line in format_lesson_report(report):
        typer.echo(line)
    if not report.ok:
        raise typer.Exit(code=1)
    typer.echo("Wrote web/lib/learn/course.generated.ts and web/lib/server/learn/keys.generated.ts.")


@app.command("blind-export")
def blind_export(
    out: Annotated[Path, typer.Option("--out", help="The JSON file to write.")],
    repo: Annotated[str | None, typer.Option("--repo", help="Only this repo's puzzles.")] = None,
    content_dir: ContentDirOption = CONTENT_DIR,
) -> None:
    """Write puzzles with only what a blind solver may see."""
    try:
        puzzles = export_puzzles(content_dir, repo)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error
    write_export(puzzles, out)
    typer.echo(f"Wrote {len(puzzles)} puzzles to {out}")


@app.command("blind-check")
def blind_check(
    answers: Annotated[Path, typer.Argument(help="JSON mapping puzzle id to a Submission.")],
    solver: Annotated[str, typer.Option("--solver", help="Recorded as agent:<name>.")],
    write: Annotated[
        bool, typer.Option("--write", help="Add the solver to verified_by for passes.")
    ] = False,
    content_dir: ContentDirOption = CONTENT_DIR,
) -> None:
    """Grade a blind solver's answers. Prints pass or fail only, never the key."""
    try:
        results = check_answers(content_dir, answers, solver, write, typer.echo)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error
    if not all(result.passed for result in results):
        raise typer.Exit(code=1)


@app.command("snapshot-all")
def snapshot_all(
    force: bool = typer.Option(False, "--force", help="Rebuild snapshots that already exist."),
) -> None:
    """Snapshot every repo in content/repos.yaml, continuing past failures."""
    try:
        repos = load_repos(paths.REPOS_YAML)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error

    summaries: list[SnapshotSummary] = []
    failures: dict[str, str] = {}
    for repo in repos:
        existing = None if force else read_summary(paths.OUT_DIR / repo.snapshot_name)
        if existing is not None:
            typer.echo(f"Already snapshotted: {repo.snapshot_name}")
            summaries.append(existing)
            continue
        typer.echo(f"\n=== {repo.slug}")
        # Anything can go wrong in a stranger's repo, and it shouldn't stop the others.
        try:
            summaries.append(_snapshot(repo))
        except Exception as error:
            failures[repo.slug] = str(error)
            typer.secho(f"error: {repo.slug}: {error}", fg=typer.colors.RED, err=True)

    typer.echo("")
    _print_table(summaries)
    if failures:
        typer.secho(f"\n{len(failures)} failed: {', '.join(failures)}", fg=typer.colors.RED)
        raise typer.Exit(code=1)


DryRunOption = Annotated[
    bool, typer.Option("--dry-run", help="Say what would be uploaded without uploading.")
]


@app.command()
def upload(slug: str, dry_run: DryRunOption = False) -> None:
    """Upload one snapshot's manifest and files to R2, skipping files already there.

    Needs R2_* from ingest/.env: `uv run --env-file .env python -m ingest upload <slug>`.
    """
    try:
        repo = find_repo(paths.REPOS_YAML, slug)
        _upload(r2_store_from_env(), [repo], dry_run)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


@app.command("upload-all")
def upload_all(dry_run: DryRunOption = False) -> None:
    """Upload every repo's snapshot in content/repos.yaml to R2. Stops at the first failure."""
    try:
        _upload(r2_store_from_env(), load_repos(paths.REPOS_YAML), dry_run)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


def _upload(store: ObjectStore, repos: list[Repo], dry_run: bool) -> None:
    for repo in repos:
        try:
            upload_snapshot(
                store,
                paths.OUT_DIR / repo.snapshot_name,
                repo.snapshot_name,
                typer.echo,
                dry_run=dry_run,
            )
        except IngestError:
            raise
        except Exception as error:
            raise IngestError(f"{repo.slug}: {describe_upload_error(error)}") from error


def _snapshot(repo: Repo) -> SnapshotSummary:
    checkout, cached = fetch_repo(repo, paths.WORK_DIR)
    typer.echo(f"{'Using cached' if cached else 'Fetched'} {checkout.name}")

    filtered = filter_tree(checkout)
    stage_dir = paths.WORK_DIR / f"{repo.snapshot_name}.stage"
    stage_files(checkout, filtered.kept, stage_dir)
    indexer_name = "scip-python" if repo.language == "python" else "scip-typescript"
    typer.echo(f"Indexing {len(filtered.kept)} files with {indexer_name}...")
    indexed = run_indexer(repo.language, stage_dir)

    def read_source(rel_path: str) -> bytes | None:
        path = stage_dir / rel_path
        return path.read_bytes() if path.is_file() else None

    index = load_index(indexed.index_path)
    if not index.documents:
        raise IngestError(f"{indexed.indexer_name} indexed no files in {repo.slug}.")
    conversion = convert_index(index, read_source)
    indexed_paths = {normalize_path(document.relative_path) for document in index.documents}
    summary = summarize(repo, filtered.kept, indexed_paths, conversion, read_source)
    target = write_snapshot(
        repo, checkout, filtered.kept, conversion, indexed, summary, paths.OUT_DIR
    )
    _print_summary(target.name, summary, filtered.skipped_by_reason(), conversion)
    return summary


def _print_table(summaries: list[SnapshotSummary]) -> None:
    columns = ("repo", "files", "symbols", "callable", "edges", "non-test lines", "coverage")
    rows = [
        (
            s.slug,
            str(s.files),
            str(s.non_test_symbols),
            str(s.non_test_callable_symbols),
            str(s.non_test_edges),
            str(s.non_test_lines),
            f"{s.coverage:.0%}",
        )
        for s in summaries
    ]
    widths = [max(len(row[i]) for row in [columns, *rows]) for i in range(len(columns))]
    typer.echo("Symbols, callable, edges and coverage count non-test source only.")
    for row in [columns, *rows]:
        typer.echo(
            "  ".join(
                cell.ljust(width) if i == 0 else cell.rjust(width)
                for i, (cell, width) in enumerate(zip(row, widths, strict=True))
            )
        )


def _print_summary(
    name: str, summary: SnapshotSummary, skipped: Counter[str], conversion: Conversion
) -> None:
    stats = conversion.stats
    typer.echo(f"\nSnapshot: {name}")
    typer.echo(f"Files:    {summary.files}")
    typer.echo(f"Symbols:  {summary.symbols} ({summary.non_test_symbols} in non-test source)")
    typer.echo(f"Callable: {summary.non_test_callable_symbols} in non-test source")
    typer.echo(f"Edges:    {summary.edges} ({summary.non_test_edges} in non-test source)")
    typer.echo(f"Non-test source lines: {summary.non_test_lines}")
    typer.echo(
        f"Non-test source files indexed: {summary.non_test_files_indexed} of "
        f"{summary.non_test_source_files} ({summary.coverage:.0%})"
    )
    typer.echo(f"Skipped files: {sum(skipped.values())}{_breakdown(skipped)}")
    typer.echo(f"Excluded definitions:{_breakdown(stats.excluded_definitions)}")
    typer.echo(f"Promoted symbols (only scip_local can be a callee):{_breakdown(stats.promoted)}")
    typer.echo(f"Symbol ranges from:{_breakdown(stats.range_sources)}")
    typer.echo(
        f"References to symbols outside the snapshot: {stats.references_to_external_symbols}"
    )
    typer.echo(f"References outside any callable: {stats.references_outside_callables}")
    typer.echo(f"References to non-callable symbols: {stats.references_to_non_callables}")
    typer.echo(f"References in types, decorators, base classes: {stats.references_not_calls}")
    undefined_locals = sum(stats.local_only_identifiers.values())
    typer.echo(f"Local identifiers with no definition in the index: {undefined_locals}")


def _breakdown(counts: Counter[str]) -> str:
    if not counts:
        return " (none)"
    return "".join(f"\n  {reason}: {count}" for reason, count in sorted(counts.items()))
