"""Turn a parsed SCIP index into snapshot records: symbols, occurrences, call edges.

Output lines and columns are 1-based, matching location IDs (`path:L120-L135`) and Monaco.
"""

import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum

from ingest.edges import edges_for_document
from ingest.extents import Extent, PropertyAssignment, SourceExtents
from ingest.proto import scip_pb2
from ingest.scip_parse import (
    DEFINITION_ROLE,
    Span,
    enclosing_span,
    normalize_path,
    occurrence_span,
)
from ingest.symbols import (
    CanonicalIds,
    Descriptor,
    Suffix,
    is_local,
    parse_descriptors,
    qualified_name,
    short_name,
)

_CALLABLE_KINDS = frozenset(
    {
        "abstract_method",
        "accessor",
        "class",
        "constructor",
        "function",
        "getter",
        "macro",
        "method",
        "method_alias",
        "setter",
        "static_method",
    }
)
# scip-typescript only gives a variable an enclosing range when it holds a function.
_VARIABLE_KINDS = frozenset({"constant", "variable"})
_UNKNOWN_KIND = "unknown"
_KIND_FROM_SUFFIX = {
    Suffix.MACRO: "macro",
    Suffix.METHOD: "method",
    Suffix.NAMESPACE: "namespace",
    Suffix.TERM: "term",
    Suffix.TYPE: "type",
}
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


class RangeSource(StrEnum):
    SCIP = "scip"
    TREE_SITTER = "tree_sitter"
    NAME_ONLY = "name_only"


@dataclass(frozen=True)
class SymbolRecord:
    symbol_id: str
    name: str
    kind: str
    file: str
    span: Span
    body: Span
    callable: bool


@dataclass(frozen=True, order=True)
class OccurrenceRecord:
    file: str
    line: int
    col: int
    symbol_id: str
    role: str


@dataclass
class ConversionStats:
    excluded_definitions: Counter[str] = field(default_factory=Counter[str])
    promoted: Counter[str] = field(default_factory=Counter[str])
    range_sources: Counter[str] = field(default_factory=Counter[str])
    local_only_identifiers: Counter[str] = field(default_factory=Counter[str])
    references_to_external_symbols: int = 0
    references_outside_callables: int = 0
    references_to_non_callables: int = 0


@dataclass
class PromotedSymbols:
    """Symbols scip-typescript doesn't emit as definitions, for one document. See _promote."""

    records: list[SymbolRecord] = field(default_factory=list[SymbolRecord])
    by_local: dict[str, SymbolRecord] = field(default_factory=dict[str, SymbolRecord])
    definition_sites: dict[tuple[int, int], SymbolRecord] = field(
        default_factory=dict[tuple[int, int], SymbolRecord]
    )
    # `exports` in `exports.x = ...` shares x's local, but it isn't a reference to x.
    exports_roots: set[tuple[int, int]] = field(default_factory=set[tuple[int, int]])


@dataclass
class Conversion:
    symbols: list[SymbolRecord]
    occurrences: list[OccurrenceRecord]
    edges: list[tuple[str, str]]
    stats: ConversionStats


def convert_index(index: scip_pb2.Index, read_source: Callable[[str], bytes | None]) -> Conversion:
    """Convert an index. read_source returns a file's bytes by repo-relative path."""
    stats = ConversionStats()
    ids = CanonicalIds()
    documents = sorted(
        ((normalize_path(doc.relative_path), doc) for doc in index.documents),
        key=lambda item: item[0],
    )

    # Symbols come first so references in earlier files can resolve to ones defined in later files.
    owners: dict[str, SymbolRecord] = {}
    promoted: dict[str, PromotedSymbols] = {}
    for path, document in documents:
        extents = SourceExtents(path, read_source(path))
        _collect_definitions(path, document, extents, ids, owners, stats)
        promoted[path] = _promote(path, document, extents, ids, owners, stats)

    all_symbols = list(owners.values())
    for symbols_in_document in promoted.values():
        all_symbols.extend(symbols_in_document.records)

    occurrences: set[OccurrenceRecord] = set()
    edges: set[tuple[str, str]] = set()
    defined_in = _group_by_file(all_symbols)
    for path, document in documents:
        here = promoted[path]

        def resolve(
            symbol: str, by_local: dict[str, SymbolRecord] = here.by_local
        ) -> SymbolRecord | None:
            return by_local.get(symbol) if is_local(symbol) else owners.get(symbol)

        _collect_occurrences(path, document, owners, here, occurrences, stats)
        edges.update(edges_for_document(document, defined_in.get(path, []), resolve, stats))

    symbols = sorted(all_symbols, key=lambda s: (s.file, s.span, s.symbol_id))
    return Conversion(symbols, sorted(occurrences), sorted(edges), stats)


def _collect_definitions(
    path: str,
    document: scip_pb2.Document,
    extents: SourceExtents,
    ids: CanonicalIds,
    owners: dict[str, SymbolRecord],
    stats: ConversionStats,
) -> None:
    kinds = {info.symbol: _kind_name(info.kind) for info in document.symbols}
    excluded: dict[str, str] = {}

    # SCIP doesn't promise an occurrence order, so "index order" means source order: it's stable.
    for occurrence in sorted(document.occurrences, key=occurrence_span):
        symbol = occurrence.symbol
        if (
            is_local(symbol)
            or not occurrence.symbol_roles & DEFINITION_ROLE
            or symbol in owners
            or symbol in excluded
        ):
            continue

        descriptors = parse_descriptors(symbol)
        qualified = qualified_name(descriptors, path)
        if qualified is None:
            excluded[symbol] = _exclusion_reason(descriptors)
            continue

        kind = kinds.get(symbol, _UNKNOWN_KIND)
        if kind == _UNKNOWN_KIND:
            kind = _KIND_FROM_SUFFIX.get(descriptors[-1].suffix, _UNKNOWN_KIND)
        name_span = occurrence_span(occurrence)
        extent, source_of_range = _resolve_extent(occurrence, name_span, kind, extents)
        stats.range_sources[source_of_range] += 1
        owners[symbol] = SymbolRecord(
            symbol_id=ids.assign(path, qualified),
            name=short_name(qualified),
            kind=kind,
            file=path,
            span=extent.span,
            body=extent.body,
            callable=kind in _CALLABLE_KINDS or extent.is_function,
        )

    stats.excluded_definitions.update(excluded.values())
    locals_defined = {
        occurrence.symbol
        for occurrence in document.occurrences
        if is_local(occurrence.symbol) and occurrence.symbol_roles & DEFINITION_ROLE
    }
    stats.excluded_definitions["local"] += len(locals_defined)
    all_locals = {occ.symbol for occ in document.occurrences if is_local(occ.symbol)}
    stats.local_only_identifiers[path] = len(all_locals - locals_defined)


def _promote(
    path: str,
    document: scip_pb2.Document,
    extents: SourceExtents,
    ids: CanonicalIds,
    owners: dict[str, SymbolRecord],
    stats: ConversionStats,
) -> PromotedSymbols:
    """Name top-level `root.name = function () {}` methods that SCIP leaves undefined.

    scip-typescript reports these as locals with no definition role, or not at all. The root must
    resolve in SCIP, at its exact position, to a symbol defined in this file. Nothing is looked up
    by name: only the SCIP local at the property's own position links it to its references, so a
    method with no such local gets an ID but can't be a callee.
    """
    by_position: dict[tuple[int, int], list[scip_pb2.Occurrence]] = {}
    defined_locals: set[str] = set()
    for occurrence in document.occurrences:
        span = occurrence_span(occurrence)
        by_position.setdefault((span.start_line, span.start_col), []).append(occurrence)
        if is_local(occurrence.symbol) and occurrence.symbol_roles & DEFINITION_ROLE:
            defined_locals.add(occurrence.symbol)

    promoted = PromotedSymbols()
    for target in extents.function_property_assignments():
        position = (target.property_line, target.property_col)
        at_property = by_position.get(position, [])
        if any(not is_local(occurrence.symbol) for occurrence in at_property):
            continue  # SCIP already named it, as it does for `Foo.prototype.bar`.
        at_root = by_position.get((target.root_line, target.root_col), [])
        root = _root_name(target, at_root, at_property, path, owners)
        if root is None:
            continue
        if not root:
            promoted.exports_roots.add((target.root_line, target.root_col))
        local = next(
            (
                o.symbol
                for o in at_property
                if is_local(o.symbol) and o.symbol not in defined_locals
            ),
            None,
        )
        if local is not None and local in promoted.by_local:
            promoted.definition_sites[position] = promoted.by_local[local]
            continue
        extent = extents.find(*position)
        if extent is None:
            continue
        qualified = f"{root}.{target.property_name}" if root else target.property_name
        record = SymbolRecord(
            symbol_id=ids.assign(path, qualified),
            name=target.property_name,
            kind="method" if root else "function",
            file=path,
            span=extent.span,
            body=extent.body,
            callable=True,
        )
        promoted.records.append(record)
        promoted.definition_sites[position] = record
        stats.range_sources[RangeSource.TREE_SITTER] += 1
        if local is None:
            stats.promoted["syntax_only"] += 1
        else:
            promoted.by_local[local] = record
            stats.promoted["scip_local"] += 1
    return promoted


def _root_name(
    target: PropertyAssignment,
    at_root: list[scip_pb2.Occurrence],
    at_property: list[scip_pb2.Occurrence],
    path: str,
    owners: dict[str, SymbolRecord],
) -> str | None:
    """Return the root's name within this file: "" for `exports`, None if it isn't file-level."""
    if target.root_name == "exports":
        # scip-typescript gives `exports` and x in `exports.x = ...` one shared local.
        shared = {o.symbol for o in at_root} & {o.symbol for o in at_property}
        return "" if any(is_local(symbol) for symbol in shared) else None
    for occurrence in at_root:
        if is_local(occurrence.symbol):
            continue
        owner = owners.get(occurrence.symbol)
        if owner is not None and owner.file == path:
            return owner.symbol_id.partition("#")[2]
    return None


def _resolve_extent(
    occurrence: scip_pb2.Occurrence, name_span: Span, kind: str, extents: SourceExtents
) -> tuple[Extent, RangeSource]:
    enclosing = enclosing_span(occurrence)
    if enclosing is not None:
        return Extent(enclosing, enclosing, kind in _VARIABLE_KINDS), RangeSource.SCIP
    found = extents.find(name_span.start_line, name_span.start_col)
    if found is not None:
        return found, RangeSource.TREE_SITTER
    return Extent(name_span, name_span, is_function=False), RangeSource.NAME_ONLY


def _collect_occurrences(
    path: str,
    document: scip_pb2.Document,
    owners: dict[str, SymbolRecord],
    promoted: PromotedSymbols,
    occurrences: set[OccurrenceRecord],
    stats: ConversionStats,
) -> None:
    for (line, col), record in promoted.definition_sites.items():
        occurrences.add(OccurrenceRecord(path, line + 1, col + 1, record.symbol_id, "definition"))

    for occurrence in document.occurrences:
        if is_local(occurrence.symbol):
            span = occurrence_span(occurrence)
            record = promoted.by_local.get(occurrence.symbol)
            position = (span.start_line, span.start_col)
            if (
                record is not None
                and position not in promoted.definition_sites
                and position not in promoted.exports_roots
            ):
                occurrences.add(
                    OccurrenceRecord(
                        path, span.start_line + 1, span.start_col + 1, record.symbol_id, "reference"
                    )
                )
            continue
        is_definition = bool(occurrence.symbol_roles & DEFINITION_ROLE)
        owner = owners.get(occurrence.symbol)
        if owner is None:
            if not is_definition and not _is_file_symbol(occurrence.symbol):
                stats.references_to_external_symbols += 1
            continue
        span = occurrence_span(occurrence)
        occurrences.add(
            OccurrenceRecord(
                file=path,
                line=span.start_line + 1,
                col=span.start_col + 1,
                symbol_id=owner.symbol_id,
                role="definition" if is_definition else "reference",
            )
        )


def _group_by_file(records: list[SymbolRecord]) -> dict[str, list[SymbolRecord]]:
    grouped: dict[str, list[SymbolRecord]] = {}
    for record in records:
        grouped.setdefault(record.file, []).append(record)
    return grouped


def _is_file_symbol(symbol: str) -> bool:
    return all(d.suffix is Suffix.NAMESPACE for d in parse_descriptors(symbol))


def _exclusion_reason(descriptors: list[Descriptor]) -> str:
    suffix = descriptors[-1].suffix
    if suffix is Suffix.NAMESPACE:
        return "file"
    return str(suffix)


def _kind_name(kind: "scip_pb2.SymbolInformation.Kind.ValueType") -> str:
    if kind == scip_pb2.SymbolInformation.UnspecifiedKind:
        return _UNKNOWN_KIND
    name = scip_pb2.SymbolInformation.Kind.Name(kind)
    return _CAMEL_BOUNDARY.sub("_", name).lower()
