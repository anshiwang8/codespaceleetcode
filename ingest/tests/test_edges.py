"""Call-edge derivation on tests/fixtures/tiny-repo, using an index.scip from the real indexer.

Rebuild the index with scripts/regen_fixture_index.py if the fixture's source changes.
"""

from pathlib import Path

import pytest

from ingest.convert import Conversion, SymbolRecord, convert_index
from ingest.extents import SourceExtents
from ingest.scip_parse import Span, load_index

FIXTURES = Path(__file__).parent / "fixtures"
TINY_REPO = FIXTURES / "tiny-repo"


@pytest.fixture(scope="module")
def conversion() -> Conversion:
    def read_source(rel_path: str) -> bytes | None:
        path = TINY_REPO / rel_path
        return path.read_bytes() if path.is_file() else None

    return convert_index(load_index(FIXTURES / "tiny-repo.scip"), read_source)


def test_exact_call_edges(conversion: Conversion) -> None:
    assert conversion.edges == [
        ("lib/main.js#Widget", "lib/main.js#greet"),
        ("lib/main.js#Widget.render", "lib/main.js#greet"),
        ("lib/main.js#Widget.renderTwice", "lib/main.js#Widget.render"),
        ("lib/main.js#app.listen", "lib/main.js#greet"),
        ("lib/main.js#app.start", "lib/main.js#app.listen"),
        ("lib/main.js#greet", "lib/main.js#format"),
        ("lib/main.js#outer", "lib/main.js#format"),
        ("lib/main.js#passAsValue", "lib/main.js#format"),
        ("lib/main.js#res.json", "lib/main.js#format"),
        ("lib/main.js#res.jsonAlias", "lib/main.js#format"),
        ("lib/main.js#res.send", "lib/main.js#format"),
        ("lib/main.js#setup", "lib/main.js#format"),
        ("lib/utils.js#clean", "lib/utils.js#base"),
        ("lib/utils.js#cleanAll", "lib/utils.js#clean"),
    ]


def test_left_side_of_a_prototype_assignment_is_not_a_call(conversion: Conversion) -> None:
    # `Widget.prototype.render = ...` mentions Widget, but render doesn't call Widget.
    assert ("lib/main.js#Widget.render", "lib/main.js#Widget") not in conversion.edges


def test_reference_in_a_nested_local_function_goes_to_the_nearest_named_caller(
    conversion: Conversion,
) -> None:
    # inner is a local symbol, so its call to format belongs to outer.
    assert ("lib/main.js#outer", "lib/main.js#format") in conversion.edges


def test_top_level_references_produce_no_edge(conversion: Conversion) -> None:
    # `var banner = greet('top level')` is a reference to greet outside any callable.
    assert not [edge for edge in conversion.edges if "banner" in edge[0]]
    assert conversion.stats.references_outside_callables > 0


def _record(conversion: Conversion, symbol_id: str) -> SymbolRecord:
    return next(s for s in conversion.symbols if s.symbol_id == symbol_id)


def test_promoted_methods_get_ids_kinds_and_ranges(conversion: Conversion) -> None:
    listen = _record(conversion, "lib/main.js#app.listen")
    assert (listen.name, listen.kind, listen.callable) == ("listen", "method", True)
    assert (listen.span.start_line + 1, listen.span.last_line + 1) == (40, 42)
    assert _record(conversion, "lib/utils.js#clean").kind == "function"
    assert conversion.stats.promoted == {"scip_local": 4, "syntax_only": 3}


def test_promoted_local_keeps_its_scip_references(conversion: Conversion) -> None:
    # `this.listen()` resolves in SCIP to the local at the `app.listen` property.
    occurrences = [o for o in conversion.occurrences if o.symbol_id == "lib/main.js#app.listen"]
    assert [(o.line, o.col, o.role) for o in occurrences] == [
        (40, 5, "definition"),
        (45, 15, "reference"),
    ]


def test_exports_references_resolve_through_the_shared_local(conversion: Conversion) -> None:
    occurrences = [o for o in conversion.occurrences if o.symbol_id == "lib/utils.js#clean"]
    assert [(o.line, o.role) for o in occurrences] == [(7, "definition"), (12, "reference")]


def test_method_without_a_scip_local_is_never_a_callee(conversion: Conversion) -> None:
    # SCIP doesn't resolve `this.send()`. Matching it to res.send by name would break rule 7.
    assert ("lib/main.js#res.json", "lib/main.js#res.send") not in conversion.edges
    occurrences = [o for o in conversion.occurrences if o.symbol_id == "lib/main.js#res.send"]
    assert [(o.line, o.role) for o in occurrences] == [(69, "definition")]


def test_chained_aliases_share_a_body_and_both_call(conversion: Conversion) -> None:
    json = _record(conversion, "lib/main.js#res.json")
    alias = _record(conversion, "lib/main.js#res.jsonAlias")
    assert json.body == alias.body
    assert ("lib/main.js#res.jsonAlias", "lib/main.js#format") in conversion.edges


@pytest.mark.parametrize(
    "absent",
    [
        "lib/main.js#app.config",  # not a function
        "lib/main.js#app.computed",  # computed target
        "lib/main.js#app.dynamic",  # computed target inside a callback
        "lib/main.js#app.nested",  # not a top-level statement
    ],
)
def test_other_assignment_shapes_are_not_promoted(conversion: Conversion, absent: str) -> None:
    assert absent not in {symbol.symbol_id for symbol in conversion.symbols}


def test_prototype_method_range_comes_from_tree_sitter(conversion: Conversion) -> None:
    render = next(s for s in conversion.symbols if s.symbol_id == "lib/main.js#Widget.render")
    assert render.kind == "method"
    assert (render.span.start_line + 1, render.span.last_line + 1) == (26, 28)
    assert conversion.stats.range_sources["tree_sitter"] > 0
    assert conversion.stats.range_sources["scip"] > 0


def test_every_occurrence_and_edge_resolves_to_a_symbol(conversion: Conversion) -> None:
    ids = {symbol.symbol_id for symbol in conversion.symbols}
    assert {occurrence.symbol_id for occurrence in conversion.occurrences} <= ids
    assert {symbol_id for edge in conversion.edges for symbol_id in edge} <= ids


def test_every_occurrence_token_spells_its_symbol_name(conversion: Conversion) -> None:
    # Promotion trusts SCIP's locals, so a wrong link would show up as a mismatched token.
    names = {symbol.symbol_id: symbol.name for symbol in conversion.symbols}
    for occurrence in conversion.occurrences:
        line = (
            (TINY_REPO / occurrence.file)
            .read_text(encoding="utf-8")
            .splitlines()[occurrence.line - 1]
        )
        assert line[occurrence.col - 1 :].startswith(names[occurrence.symbol_id]), occurrence


def test_occurrences_are_one_based(conversion: Conversion) -> None:
    definitions = [
        occurrence
        for occurrence in conversion.occurrences
        if occurrence.symbol_id == "lib/main.js#format" and occurrence.role == "definition"
    ]
    assert [(occurrence.line, occurrence.col) for occurrence in definitions] == [(11, 10)]


def test_chained_assignment_body_is_the_function() -> None:
    source = b"a.b = a.c = function () {\n  return 1;\n};\n"
    extent = SourceExtents("x.js", source).find(0, 2)
    assert extent is not None
    assert extent.is_function
    assert extent.span == Span(0, 0, 2, 1)
    assert extent.body == Span(0, 12, 2, 1)


def test_columns_convert_through_utf16_for_non_ascii_lines() -> None:
    # The emoji is 4 UTF-8 bytes but 2 UTF-16 units, so `b` is at UTF-16 column 10, not byte 12.
    source = "a['😀'] = b.c = function () {};\n".encode()
    extent = SourceExtents("x.js", source).find(0, 10)
    assert extent is not None
    assert extent.is_function
    assert extent.span.start_col == 10
    assert extent.body.start_col == 16


def test_unsupported_languages_have_no_tree_sitter_extent() -> None:
    extents = SourceExtents("x.go", b"func a() {}\n")
    assert extents.find(0, 5) is None
    assert not extents.is_non_call(0, 5)


def test_only_javascript_gets_property_promotion() -> None:
    source = b"a.b = function () {};\n"
    assert SourceExtents("x.js", source).function_property_assignments()
    assert not SourceExtents("x.ts", source).function_property_assignments()


def test_promoted_definition_end_col_is_the_property_token(conversion: Conversion) -> None:
    listen = next(
        o
        for o in conversion.occurrences
        if o.symbol_id == "lib/main.js#app.listen" and o.role == "definition"
    )
    assert listen.end_col - listen.col == len("listen")


def test_end_col_spans_exactly_the_token(conversion: Conversion) -> None:
    names = {symbol.symbol_id: symbol.name for symbol in conversion.symbols}
    for occurrence in conversion.occurrences:
        text = (TINY_REPO / occurrence.file).read_text(encoding="utf-8")
        line = text.splitlines()[occurrence.line - 1]
        assert line[occurrence.col - 1 : occurrence.end_col - 1] == names[occurrence.symbol_id]


def test_span_last_line_ignores_an_end_at_column_zero() -> None:
    assert Span(1, 0, 4, 0).last_line == 3
    assert Span(1, 0, 4, 1).last_line == 4
