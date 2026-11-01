"""Derive call edges from SCIP references: each one belongs to its innermost enclosing callable."""

from collections.abc import Callable
from typing import TYPE_CHECKING

from ingest.extents import SourceExtents
from ingest.proto import scip_pb2
from ingest.scip_parse import DEFINITION_ROLE, occurrence_span

if TYPE_CHECKING:
    from ingest.convert import ConversionStats, SymbolRecord


def edges_for_document(
    document: scip_pb2.Document,
    defined_here: "list[SymbolRecord]",
    resolve: "Callable[[str], SymbolRecord | None]",
    extents: SourceExtents,
    stats: "ConversionStats",
) -> set[tuple[str, str]]:
    """Return (caller_symbol_id, callee_symbol_id) pairs for one document.

    These are references inside a callable's body, so a function passed as a value counts as a
    call. A variable holding a required function isn't callable by kind, so it never appears. Nor
    does a class named only as a type, since nothing runs there.
    """
    callers = [record for record in defined_here if record.callable]
    edges: set[tuple[str, str]] = set()
    for occurrence in document.occurrences:
        if occurrence.symbol_roles & DEFINITION_ROLE:
            continue
        callee = resolve(occurrence.symbol)
        if callee is None:
            continue
        span = occurrence_span(occurrence)
        innermost = _innermost(callers, span.start_line, span.start_col)
        if not innermost:
            stats.references_outside_callables += 1
        elif not callee.callable:
            stats.references_to_non_callables += 1
        elif extents.is_non_call(span.start_line, span.start_col):
            stats.references_not_calls += 1
        else:
            edges.update((caller.symbol_id, callee.symbol_id) for caller in innermost)
    return edges


def _innermost(callers: "list[SymbolRecord]", line: int, col: int) -> "list[SymbolRecord]":
    """Return the innermost callers. There are several only when aliases share one body, as in
    `req.get = req.header = function () {}`."""
    containing = [
        (body, record) for record in callers for body in record.bodies if body.contains(line, col)
    ]
    if not containing:
        return []
    # The latest start is the innermost, because definition ranges nest rather than overlap.
    innermost = max(body for body, _ in containing)
    return [record for body, record in containing if body == innermost]
