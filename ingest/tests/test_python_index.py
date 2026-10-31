"""IDs, ranges and edges on tests/fixtures/tiny-python, using an index from real scip-python.

Rebuild the index with scripts/regen_fixture_index.py if the fixture's source changes.
"""

from pathlib import Path

import pytest

from ingest.convert import Conversion, SymbolRecord, convert_index
from ingest.extents import SourceExtents
from ingest.scip_parse import load_index

FIXTURES = Path(__file__).parent / "fixtures"
REPO = FIXTURES / "tiny-python"
INDEX = FIXTURES / "tiny-python.scip"
CORE = "src/tiny/core.py"
MODELS = "src/tiny/models.py"


@pytest.fixture(scope="module")
def conversion() -> Conversion:
    def read_source(rel_path: str) -> bytes | None:
        path = REPO / rel_path
        return path.read_bytes() if path.is_file() else None

    return convert_index(load_index(INDEX), read_source)


def _record(conversion: Conversion, symbol_id: str) -> SymbolRecord:
    return next(s for s in conversion.symbols if s.symbol_id == symbol_id)


def _lines(record: SymbolRecord) -> tuple[int, int]:
    return (record.span.start_line + 1, record.span.last_line + 1)


def test_index_came_from_scip_python_and_holds_no_machine_paths() -> None:
    index = load_index(INDEX)
    assert index.metadata.tool_info.name == "scip-python"
    assert index.metadata.project_root == ""
    data = INDEX.read_bytes()
    for marker in (b"file://", b"C:\\", b"C:/", b"/Users/", b"/home/", b"typeshed"):
        assert marker not in data


@pytest.mark.parametrize(
    "symbol_id",
    [
        f"{CORE}#helper",
        f"{CORE}#log_calls.wrapper",
        f"{CORE}#outer.inner",
        f"{MODELS}#Session",
        f"{MODELS}#Session.go",
        f"{MODELS}#Session.Inner.deep",
        f"{MODELS}#Session.timeout",
        f"{MODELS}#Base.closed",
        "src/tiny/__init__.py#make_session",
        "src/tiny/__init__.py#VERSION",
        "top.py#main",
        "tests/test_core.py#test_helper",
    ],
)
def test_ids_read_as_path_and_qualified_name(conversion: Conversion, symbol_id: str) -> None:
    assert symbol_id in {symbol.symbol_id for symbol in conversion.symbols}


def test_no_id_carries_the_module_or_a_meta_descriptor(conversion: Conversion) -> None:
    for symbol in conversion.symbols:
        qualified = symbol.symbol_id.partition("#")[2]
        assert "tiny" not in qualified
        assert "__init__" not in qualified or qualified.endswith(".__init__")
    assert conversion.stats.excluded_definitions["meta"] == 5  # one per module


def test_parameters_and_locals_get_no_id(conversion: Conversion) -> None:
    names = {symbol.name for symbol in conversion.symbols}
    assert not names & {"self", "value", "other", "args", "kwargs", "key"}


@pytest.mark.parametrize(
    ("symbol_id", "kind"),
    [
        (f"{CORE}#helper", "function"),
        (f"{CORE}#log_calls.wrapper", "function"),
        (f"{MODELS}#Session.go", "method"),
        (f"{MODELS}#Session", "class"),
        (f"{MODELS}#Session.timeout", "variable"),
    ],
)
def test_kinds_come_from_descriptors(conversion: Conversion, symbol_id: str, kind: str) -> None:
    assert _record(conversion, symbol_id).kind == kind


@pytest.mark.parametrize(
    ("symbol_id", "expected"),
    [
        (f"{CORE}#helper", (22, 23)),
        (f"{CORE}#decorated", (26, 28)),  # the range starts at the decorator
        (f"{CORE}#SETTINGS", (7, 10)),  # a multi-line constant, from tree-sitter
        (f"{CORE}#double", (38, 38)),
        (f"{MODELS}#Session", (21, 54)),
        (f"{MODELS}#Session.go", (28, 30)),
    ],
)
def test_ranges(conversion: Conversion, symbol_id: str, expected: tuple[int, int]) -> None:
    assert _lines(_record(conversion, symbol_id)) == expected


def test_ranges_come_from_scip_where_it_gives_them(conversion: Conversion) -> None:
    assert conversion.stats.range_sources["scip"] > 0
    assert conversion.stats.range_sources["tree_sitter"] > 0
    assert conversion.stats.range_sources["name_only"] == 0


def test_exact_call_edges(conversion: Conversion) -> None:
    assert conversion.edges == [
        ("src/tiny/__init__.py#make_session", f"{CORE}#helper"),
        ("src/tiny/__init__.py#make_session", f"{MODELS}#Session"),
        (f"{CORE}#decorated", f"{CORE}#helper"),
        (f"{CORE}#double", f"{CORE}#helper"),
        (f"{CORE}#label", f"{CORE}#emoji_name"),
        (f"{CORE}#log_calls", f"{CORE}#log_calls.wrapper"),
        (f"{CORE}#log_calls.wrapper", f"{CORE}#helper"),
        (f"{CORE}#outer", f"{CORE}#outer.inner"),
        (f"{CORE}#outer.inner", f"{CORE}#helper"),
        (f"{MODELS}#Base.go", f"{CORE}#helper"),
        (f"{MODELS}#Base.run", f"{MODELS}#Base.go"),
        (f"{MODELS}#Session", f"{CORE}#helper"),
        (f"{MODELS}#Session", f"{CORE}#log_calls"),
        (f"{MODELS}#Session", f"{MODELS}#Session.state"),
        (f"{MODELS}#Session.Inner.deep", f"{CORE}#helper"),
        (f"{MODELS}#Session.build", f"{MODELS}#Session"),
        (f"{MODELS}#Session.fetch", f"{CORE}#helper"),
        (f"{MODELS}#Session.go", f"{MODELS}#Base.go"),
        (f"{MODELS}#Session.state", f"{CORE}#helper"),
        (f"{MODELS}#uses_session", f"{MODELS}#Session.go"),
        ("tests/test_core.py#test_helper", f"{CORE}#helper"),
        ("top.py#main", "src/tiny/__init__.py#make_session"),
        ("top.py#main", f"{MODELS}#uses_session"),
    ]


def test_decorator_belongs_to_what_evaluates_it_not_the_decorated_function(
    conversion: Conversion,
) -> None:
    assert (f"{MODELS}#Session.go", f"{CORE}#log_calls") not in conversion.edges
    assert (f"{MODELS}#Session", f"{CORE}#log_calls") in conversion.edges
    assert (f"{CORE}#decorated", f"{CORE}#log_calls") not in conversion.edges


def test_annotations_and_base_classes_are_not_calls(conversion: Conversion) -> None:
    assert (f"{MODELS}#Session.annotated", f"{MODELS}#Base") not in conversion.edges
    assert (f"{MODELS}#uses_session", f"{MODELS}#Session") not in conversion.edges
    assert (f"{MODELS}#Session", f"{MODELS}#Base") not in conversion.edges


def test_every_body_of_an_overload_counts_but_only_one_id(conversion: Conversion) -> None:
    # scip-python gives the first stub the definition role, and the implementation is a reference.
    fetch = _record(conversion, f"{MODELS}#Session.fetch")
    assert len(fetch.bodies) == 3
    assert (f"{MODELS}#Session.fetch", f"{CORE}#helper") in conversion.edges
    assert [s.symbol_id for s in conversion.symbols if s.name == "fetch"] == [fetch.symbol_id]
    assert (f"{MODELS}#Session", f"{MODELS}#Session.fetch") not in conversion.edges


def test_a_redefinition_is_a_definition_occurrence(conversion: Conversion) -> None:
    occurrences = [o for o in conversion.occurrences if o.symbol_id == f"{MODELS}#Session.fetch"]
    assert [(o.line, o.role) for o in occurrences] == [
        (45, "definition"),
        (48, "definition"),
        (50, "definition"),
    ]


def test_property_setter_body_belongs_to_the_property(conversion: Conversion) -> None:
    state = _record(conversion, f"{MODELS}#Session.state")
    assert len(state.bodies) == 2
    setter_line = 38 - 1
    assert any(body.start_line == setter_line for body in state.bodies)


def test_lambda_assigned_to_a_name_is_callable(conversion: Conversion) -> None:
    assert _record(conversion, f"{CORE}#double").callable
    assert not _record(conversion, f"{CORE}#LIMIT").callable


def test_top_level_references_produce_no_edge(conversion: Conversion) -> None:
    # `main()` at module level in top.py is outside any callable.
    assert conversion.stats.references_outside_callables > 0
    assert not [edge for edge in conversion.edges if edge[1] == "top.py#main"]


def test_every_occurrence_and_edge_resolves_to_a_symbol(conversion: Conversion) -> None:
    ids = {symbol.symbol_id for symbol in conversion.symbols}
    assert {occurrence.symbol_id for occurrence in conversion.occurrences} <= ids
    assert {symbol_id for edge in conversion.edges for symbol_id in edge} <= ids


def test_end_col_spans_exactly_the_token_in_utf16(conversion: Conversion) -> None:
    names = {symbol.symbol_id: symbol.name for symbol in conversion.symbols}
    for occurrence in conversion.occurrences:
        text = (REPO / occurrence.file).read_text(encoding="utf-8")
        units = text.split("\n")[occurrence.line - 1].encode("utf-16-le")
        token = units[(occurrence.col - 1) * 2 : (occurrence.end_col - 1) * 2]
        assert token.decode("utf-16-le") == names[occurrence.symbol_id], occurrence


def test_end_col_counts_utf16_units_after_an_emoji(conversion: Conversion) -> None:
    # `return "😀 grin" + emoji_name()`: the emoji is 2 UTF-16 units, 4 UTF-8 bytes, 1 code point.
    reference = next(
        o
        for o in conversion.occurrences
        if o.symbol_id == f"{CORE}#emoji_name" and o.role == "reference"
    )
    assert (reference.col, reference.end_col) == (24, 34)


def test_python_extent_body_leaves_out_the_signature_and_decorators() -> None:
    source = b"@deco\ndef f(a: int = g()) -> int:\n    return a\n"
    extent = SourceExtents("x.py", source).find(1, 4)
    assert extent is not None
    assert extent.is_function
    assert (extent.span.start_line, extent.body.start_line) == (1, 2)


def test_python_position_inside_a_definition_does_not_name_it() -> None:
    extents = SourceExtents("x.py", b"def f(a):\n    with g() as b:\n        pass\n")
    assert extents.find(1, 16) is None  # `b` is inside f, but doesn't name it
    assert extents.find(0, 6) is None  # nor does the parameter


def test_python_type_annotation_is_a_non_call() -> None:
    extents = SourceExtents("x.py", b"def f():\n    a: Foo = Foo()\n")
    assert extents.is_non_call(1, 7)
    assert not extents.is_non_call(1, 13)
