"""Write a snapshot to ingest/out/<slug>@<sha>/."""

import json
import os
import shutil
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict
from pathlib import Path

from ingest.convert import Conversion
from ingest.fetch import remove_tree
from ingest.filters import detect_language
from ingest.indexer import IndexResult
from ingest.repos import Repo
from ingest.summary import SnapshotSummary

SUMMARY_FILE = "summary.json"


def write_snapshot(
    repo: Repo,
    checkout: Path,
    kept: Sequence[str],
    conversion: Conversion,
    indexer: IndexResult,
    summary: SnapshotSummary,
    out_dir: Path,
) -> Path:
    """Write everything to a temp dir and rename it, so a failed run leaves no partial snapshot."""
    target = out_dir / repo.snapshot_name
    temp = out_dir / f".tmp-{repo.snapshot_name}-{os.getpid()}"
    remove_tree(temp)
    (temp / "files").mkdir(parents=True)
    try:
        for rel_path in kept:
            destination = temp / "files" / rel_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(checkout / rel_path, destination)
        _write_manifest(temp / "manifest.json", repo, checkout, kept, indexer)
        _write_json(temp / SUMMARY_FILE, asdict(summary))
        _write_jsonl(
            temp / "symbols.jsonl",
            (
                {
                    "symbol_id": symbol.symbol_id,
                    "name": symbol.name,
                    "kind": symbol.kind,
                    "file": symbol.file,
                    "start_line": symbol.span.start_line + 1,
                    "end_line": symbol.span.last_line + 1,
                }
                for symbol in conversion.symbols
            ),
        )
        _write_jsonl(
            temp / "occurrences.jsonl",
            (
                {
                    "symbol_id": occurrence.symbol_id,
                    "file": occurrence.file,
                    "line": occurrence.line,
                    "col": occurrence.col,
                    "end_col": occurrence.end_col,
                    "role": occurrence.role,
                }
                for occurrence in conversion.occurrences
            ),
        )
        _write_jsonl(
            temp / "call_edges.jsonl",
            (
                {"caller_symbol_id": caller, "callee_symbol_id": callee}
                for caller, callee in conversion.edges
            ),
        )
        remove_tree(target)
        temp.rename(target)
    except BaseException:
        remove_tree(temp)
        raise
    return target


def read_summary(snapshot_dir: Path) -> SnapshotSummary | None:
    """Return a finished snapshot's summary, or None if it has none."""
    path = snapshot_dir / SUMMARY_FILE
    if not path.is_file():
        return None
    return SnapshotSummary(**json.loads(path.read_text(encoding="utf-8")))


def _write_manifest(
    path: Path, repo: Repo, checkout: Path, kept: Sequence[str], indexer: IndexResult
) -> None:
    manifest = {
        "slug": repo.slug,
        "url": repo.url,
        "sha": repo.sha,
        "language": repo.language,
        "license": repo.license,
        "indexer": {"name": indexer.indexer_name, "version": indexer.indexer_version},
        "files": [
            {
                "path": rel_path,
                "size": (checkout / rel_path).stat().st_size,
                "language": detect_language(rel_path),
            }
            for rel_path in kept
        ],
    }
    _write_json(path, manifest)


def _write_json(path: Path, value: object) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def _write_jsonl(path: Path, rows: Iterable[Mapping[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
