"""The `ingest` command line."""

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
from ingest.puzzles import CONTENT_DIR
from ingest.repos import find_repo
from ingest.scip_parse import load_index
from ingest.seed import database_url, seed_content
from ingest.validate import format_report, validate_content
from ingest.writer import write_snapshot

app = typer.Typer(no_args_is_help=True, add_completion=False)

ContentDirOption = Annotated[Path, typer.Option("--content-dir", help="The content/ directory.")]
OutDirOption = Annotated[Path, typer.Option("--out-dir", help="Where snapshots were written.")]


@app.command()
def snapshot(slug: str) -> None:
    """Fetch a repo at its pinned SHA, filter, index, and write a local snapshot."""
    try:
        _snapshot(slug)
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
def validate(
    content_dir: ContentDirOption = CONTENT_DIR, out_dir: OutDirOption = paths.OUT_DIR
) -> None:
    """Run the checks in spec section 6 on every puzzle."""
    try:
        report = validate_content(content_dir, out_dir)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error
    for line in format_report(report):
        typer.echo(line)
    if not report.ok:
        raise typer.Exit(code=1)


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


def _snapshot(slug: str) -> None:
    repo = find_repo(paths.REPOS_YAML, slug)
    checkout, cached = fetch_repo(repo, paths.WORK_DIR)
    typer.echo(f"{'Using cached' if cached else 'Fetched'} {checkout.name}")

    filtered = filter_tree(checkout)
    stage_dir = paths.WORK_DIR / f"{repo.snapshot_name}.stage"
    stage_files(checkout, filtered.kept, stage_dir)
    typer.echo(f"Indexing {len(filtered.kept)} files with scip-typescript...")
    indexed = run_indexer(repo.language, stage_dir)

    def read_source(rel_path: str) -> bytes | None:
        path = stage_dir / rel_path
        return path.read_bytes() if path.is_file() else None

    conversion = convert_index(load_index(indexed.index_path), read_source)
    target = write_snapshot(
        repo, checkout, filtered.kept, conversion, indexed.indexer_version, paths.OUT_DIR
    )
    _print_summary(target.name, len(filtered.kept), filtered.skipped_by_reason(), conversion)


def _print_summary(
    name: str, file_count: int, skipped: Counter[str], conversion: Conversion
) -> None:
    stats = conversion.stats
    typer.echo(f"\nSnapshot: {name}")
    typer.echo(f"Files:    {file_count}")
    typer.echo(f"Symbols:  {len(conversion.symbols)}")
    typer.echo(f"Edges:    {len(conversion.edges)}")
    typer.echo(f"Skipped files: {sum(skipped.values())}{_breakdown(skipped)}")
    typer.echo(f"Excluded definitions:{_breakdown(stats.excluded_definitions)}")
    typer.echo(f"Promoted symbols (only scip_local can be a callee):{_breakdown(stats.promoted)}")
    typer.echo(f"Symbol ranges from:{_breakdown(stats.range_sources)}")
    typer.echo(
        f"References to symbols outside the snapshot: {stats.references_to_external_symbols}"
    )
    typer.echo(f"References outside any callable: {stats.references_outside_callables}")
    typer.echo(f"References to non-callable symbols: {stats.references_to_non_callables}")
    undefined_locals = sum(stats.local_only_identifiers.values())
    typer.echo(f"Local identifiers with no definition in the index: {undefined_locals}")


def _breakdown(counts: Counter[str]) -> str:
    if not counts:
        return " (none)"
    return "".join(f"\n  {reason}: {count}" for reason, count in sorted(counts.items()))
