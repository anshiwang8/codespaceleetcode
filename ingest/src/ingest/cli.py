"""The `ingest` command line."""

from collections import Counter

import typer

from ingest import paths
from ingest.convert import Conversion, convert_index
from ingest.errors import IngestError
from ingest.fetch import fetch_repo
from ingest.filters import filter_tree
from ingest.indexer import run_indexer, stage_files
from ingest.repos import Repo, find_repo, load_repos
from ingest.scip_parse import load_index, normalize_path
from ingest.summary import SnapshotSummary, summarize
from ingest.writer import read_summary, write_snapshot

app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.command()
def snapshot(slug: str) -> None:
    """Fetch a repo at its pinned SHA, filter, index, and write a local snapshot."""
    try:
        _snapshot(find_repo(paths.REPOS_YAML, slug))
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


@app.command()
def seed() -> None:
    """Load content/ into Postgres. Not implemented yet."""
    typer.secho("error: ingest seed is not implemented yet.", fg=typer.colors.RED, err=True)
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
