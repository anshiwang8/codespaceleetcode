"""Call-edge derivation on tests/fixtures/tiny-repo, using an index.scip from the real indexer.

Rebuild the index with scripts/regen_fixture_index.py if the fixture's source changes.
"""

from pathlib import Path

import pytest

from ingest.convert import Conversion, convert_index
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
        ("lib/main.js#greet", "lib/main.js#format"),
        ("lib/main.js#outer", "lib/main.js#format"),
        ("lib/main.js#passAsValue", "lib/main.js#format"),
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


def test_expando_methods_stay_absent_rather_than_guessed(conversion: Conversion) -> None:
    # scip-typescript reports `app.listen = function` as a local with no definition. Rule 7 forbids
    # recovering it by name, so it has no ID and its call to greet produces no edge.
    ids = {symbol.symbol_id for symbol in conversion.symbols}
    assert "lib/main.js#app" in ids
    assert not [symbol_id for symbol_id in ids if "listen" in symbol_id]


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


def test_non_javascript_files_have_no_tree_sitter_extent() -> None:
    assert SourceExtents("x.ts", b"const a = 1;\n").find(0, 6) is None


def test_span_last_line_ignores_an_end_at_column_zero() -> None:
    assert Span(1, 0, 4, 0).last_line == 3
    assert Span(1, 0, 4, 1).last_line == 4
