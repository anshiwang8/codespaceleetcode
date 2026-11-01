"""Measure a snapshot against spec section 5: size, and whether its index can support puzzles."""

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass

from ingest.convert import Conversion
from ingest.filters import is_non_test_source
from ingest.repos import Repo


@dataclass(frozen=True)
class SnapshotSummary:
    """Counts for one snapshot. The non_test ones are what the repo selection criteria measure."""

    slug: str
    language: str
    sha: str
    files: int
    symbols: int
    edges: int
    non_test_lines: int
    non_test_source_files: int
    non_test_files_indexed: int
    non_test_symbols: int
    non_test_callable_symbols: int
    non_test_edges: int

    @property
    def coverage(self) -> float:
        """The share of non-test source files the indexer actually read."""
        return self.non_test_files_indexed / max(self.non_test_source_files, 1)


def summarize(
    repo: Repo,
    kept: Sequence[str],
    indexed_paths: Iterable[str],
    conversion: Conversion,
    read_source: Callable[[str], bytes | None],
) -> SnapshotSummary:
    source_files = {path for path in kept if is_non_test_source(path, repo.language)}
    non_test_symbols = [symbol for symbol in conversion.symbols if symbol.file in source_files]
    return SnapshotSummary(
        slug=repo.slug,
        language=repo.language,
        sha=repo.sha,
        files=len(kept),
        symbols=len(conversion.symbols),
        edges=len(conversion.edges),
        non_test_lines=sum(_line_count(read_source(path)) for path in source_files),
        non_test_source_files=len(source_files),
        non_test_files_indexed=len(source_files.intersection(indexed_paths)),
        non_test_symbols=len(non_test_symbols),
        non_test_callable_symbols=sum(symbol.callable for symbol in non_test_symbols),
        non_test_edges=sum(
            _file_of(caller) in source_files and _file_of(callee) in source_files
            for caller, callee in conversion.edges
        ),
    )


def _line_count(source: bytes | None) -> int:
    if not source:
        return 0
    return source.count(b"\n") + (0 if source.endswith(b"\n") else 1)


def _file_of(symbol_id: str) -> str:
    return symbol_id.partition("#")[0]
