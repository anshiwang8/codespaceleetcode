"""Read a written snapshot (ingest/out/<slug>@<sha>/) for validation and seeding."""

import json
from collections.abc import Iterator
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from typing import Any, cast

from ingest.errors import IngestError


@dataclass(frozen=True)
class IndexedSymbol:
    symbol_id: str
    name: str
    file: str


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="\n") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def read_manifest(directory: Path) -> dict[str, Any]:
    path = directory / "manifest.json"
    if not path.is_file():
        raise IngestError(f"{path} doesn't exist.")
    return cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))


class SnapshotIndex:
    def __init__(self, directory: Path) -> None:
        self._directory = directory
        manifest = read_manifest(directory)
        self.files: frozenset[str] = frozenset(entry["path"] for entry in manifest["files"])
        symbols_path = directory / "symbols.jsonl"
        if not symbols_path.is_file():
            raise IngestError(f"{symbols_path} doesn't exist.")
        try:
            self.symbols: dict[str, IndexedSymbol] = {
                row["symbol_id"]: IndexedSymbol(row["symbol_id"], row["name"], row["file"])
                for row in read_jsonl(symbols_path)
            }
        except (KeyError, ValueError) as error:
            raise IngestError(f"{symbols_path} is malformed.") from error
        self._line_counts: dict[str, int] = {}

    @cached_property
    def directories(self) -> frozenset[str]:
        found: set[str] = set()
        for path in self.files:
            parent = path.rpartition("/")[0]
            while parent and parent not in found:
                found.add(parent)
                parent = parent.rpartition("/")[0]
        return frozenset(found)

    @cached_property
    def symbols_by_name(self) -> dict[str, list[IndexedSymbol]]:
        grouped: dict[str, list[IndexedSymbol]] = {}
        for symbol in self.symbols.values():
            grouped.setdefault(symbol.name, []).append(symbol)
        return grouped

    @cached_property
    def callees(self) -> dict[str, set[str]]:
        """The SCIP call graph: caller to callees."""
        path = self._directory / "call_edges.jsonl"
        if not path.is_file():
            raise IngestError(f"{path} doesn't exist.")
        graph: dict[str, set[str]] = {}
        for row in read_jsonl(path):
            graph.setdefault(row["caller_symbol_id"], set()).add(row["callee_symbol_id"])
        return graph

    def line_count(self, path: str) -> int:
        if path not in self._line_counts:
            file = self._directory / "files" / path
            data = file.read_bytes() if file.is_file() else b""
            ends_open = bool(data) and not data.endswith(b"\n")
            self._line_counts[path] = data.count(b"\n") + int(ends_open)
        return self._line_counts[path]
