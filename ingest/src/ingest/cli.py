"""The `ingest` command line."""

from collections import Counter

import typer

from ingest import paths
from ingest.convert import Conversion, convert_index
from ingest.errors import IngestError
from ingest.fetch import fetch_repo
from ingest.filters import filter_tree
from ingest.indexer import run_indexer, stage_files
from ingest.repos import find_repo
from ingest.scip_parse import load_index
from ingest.writer import write_snapshot

app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.command()
def snapshot(slug: str) -> None:
    """Fetch a repo at its pinned SHA, filter, index, and write a local snapshot."""
    try:
        _snapshot(slug)
    except IngestError as error:
        typer.secho(f"error: {error}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1) from error


@app.command()
def seed() -> None:
    """Load content/ into Postgres. Not implemented yet."""
    typer.secho("error: ingest seed is not implemented yet.", fg=typer.colors.RED, err=True)
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
