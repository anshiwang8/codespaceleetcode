"""Derive call edges from SCIP references: each one belongs to its innermost enclosing callable."""

from typing import TYPE_CHECKING

from ingest.proto import scip_pb2
from ingest.scip_parse import DEFINITION_ROLE, occurrence_span
from ingest.symbols import is_local

if TYPE_CHECKING:
    from ingest.convert import ConversionStats, SymbolRecord


def edges_for_document(
    document: scip_pb2.Document,
    defined_here: "list[SymbolRecord]",
    owners: "dict[str, SymbolRecord]",
    stats: "ConversionStats",
) -> set[tuple[str, str]]:
    """Return (caller_symbol_id, callee_symbol_id) pairs for one document.

    These are references inside a callable's body, so a function passed as a value counts as a
    call. A variable holding a required function isn't callable by kind, so it never appears.
    """
    callers = [record for record in defined_here if record.callable]
    edges: set[tuple[str, str]] = set()
    for occurrence in document.occurrences:
        if is_local(occurrence.symbol) or occurrence.symbol_roles & DEFINITION_ROLE:
            continue
        callee = owners.get(occurrence.symbol)
        if callee is None:
            continue
        span = occurrence_span(occurrence)
        caller = _innermost(callers, span.start_line, span.start_col)
        if caller is None:
            stats.references_outside_callables += 1
        elif not callee.callable:
            stats.references_to_non_callables += 1
        else:
            edges.add((caller.symbol_id, callee.symbol_id))
    return edges


def _innermost(callers: "list[SymbolRecord]", line: int, col: int) -> "SymbolRecord | None":
    # The latest start is the innermost, because definition ranges nest rather than overlap.
    containing = [record for record in callers if record.body.contains(line, col)]
    return max(containing, key=lambda r: (r.body.start_line, r.body.start_col), default=None)
