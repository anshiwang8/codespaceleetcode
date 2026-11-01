"""IDs, ranges and edges on tests/fixtures/tiny-typescript, using an index from scip-typescript.

Rebuild the index with scripts/regen_fixture_index.py if the fixture's source changes.
"""

from pathlib import Path

import pytest

from ingest.convert import Conversion, SymbolRecord, convert_index
from ingest.extents import SourceExtents
from ingest.scip_parse import load_index, normalize_path

FIXTURES = Path(__file__).parent / "fixtures"
REPO = FIXTURES / "tiny-typescript"
INDEX = FIXTURES / "tiny-typescript.scip"
ROUTER = "src/core/router.ts"
UTIL = "src/util.ts"


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


def test_files_the_repos_own_tsconfig_hides_are_still_indexed() -> None:
    paths = {normalize_path(d.relative_path) for d in load_index(INDEX).documents}
    assert {"src/core/hidden.ts", "src/orphan.ts", "src/util.ts"} <= paths


@pytest.mark.parametrize(
    ("symbol_id", "kind", "lines"),
    [
        (f"{ROUTER}#exported", "function", (12, 14)),
        (f"{ROUTER}#arrow", "constant", (8, 8)),
        (f"{ROUTER}#Router", "class", (26, 60)),
        (f"{ROUTER}#Router.handle", "method", (48, 51)),
        (f"{ROUTER}#Router.create", "static_method", (57, 59)),
        (f"{ROUTER}#Router.<constructor>", "constructor", (32, 34)),
        # scip-typescript gives these no enclosing range. They come from tree-sitter.
        (f"{ROUTER}#Router.handler", "property", (30, 30)),
        (f"{ROUTER}#Router.<get>size", "getter", (36, 38)),
        (f"{ROUTER}#Router.<set>size", "setter", (40, 42)),
        (f"{ROUTER}#Inner", "namespace", (73, 77)),
        (f"{ROUTER}#Inner.nested", "function", (74, 76)),
    ],
)
def test_ids_kinds_and_ranges(
    conversion: Conversion, symbol_id: str, kind: str, lines: tuple[int, int]
) -> None:
    record = _record(conversion, symbol_id)
    assert record.kind == kind
    assert _lines(record) == lines


@pytest.mark.parametrize(
    ("symbol_id", "name"),
    [
        (f"{ROUTER}#Router.<get>size", "size"),
        (f"{ROUTER}#Router.<set>size", "size"),
        (f"{ROUTER}#Router.<constructor>", "constructor"),
        (f"{ROUTER}#Router.handle", "handle"),
    ],
)
def test_short_name_drops_the_indexers_markers(
    conversion: Conversion, symbol_id: str, name: str
) -> None:
    assert _record(conversion, symbol_id).name == name


@pytest.mark.parametrize(
    "symbol_id",
    [
        f"{ROUTER}#exported",
        f"{ROUTER}#arrow",
        f"{ROUTER}#Router.handle",
        f"{ROUTER}#Router.handler",
        f"{ROUTER}#Router.<get>size",
        f"{ROUTER}#Router.<set>size",
    ],
)
def test_functions_of_every_shape_are_callable(conversion: Conversion, symbol_id: str) -> None:
    assert _record(conversion, symbol_id).callable


def test_nested_package_ids_use_the_full_repo_path(conversion: Conversion) -> None:
    # scip-typescript's namespaces start at packages/lib, the nearest package.json.
    ids = {symbol.symbol_id for symbol in conversion.symbols}
    assert "packages/lib/src/index.ts#inPackage" in ids
    assert "packages/lib/src/index.ts#Tools.tool" in ids


def test_an_alias_only_a_nested_tsconfig_defines_still_resolves(conversion: Conversion) -> None:
    edge = ("packages/lib/src/index.ts#viaAlias", "packages/lib/src/aliased.ts#aliased")
    assert edge in conversion.edges


def test_exact_call_edges(conversion: Conversion) -> None:
    assert conversion.edges == [
        ("packages/lib/src/index.ts#inPackage", "packages/lib/src/index.ts#Tools.tool"),
        ("packages/lib/src/index.ts#viaAlias", "packages/lib/src/aliased.ts#aliased"),
        (f"{ROUTER}#Base", f"{UTIL}#helper"),
        (f"{ROUTER}#Inner.nested", f"{UTIL}#helper"),
        (f"{ROUTER}#Router", f"{UTIL}#helper"),
        (f"{ROUTER}#Router.<get>size", f"{UTIL}#helper"),
        (f"{ROUTER}#Router.<set>size", f"{ROUTER}#Router.resize"),
        (f"{ROUTER}#Router.create", f"{ROUTER}#Router.<constructor>"),
        (f"{ROUTER}#Router.handle", f"{ROUTER}#Router.handler"),
        (f"{ROUTER}#Router.handler", f"{UTIL}#helper"),
        (f"{ROUTER}#Router.resize", f"{UTIL}#helper"),
        (f"{ROUTER}#arrow", f"{UTIL}#helper"),
        (f"{ROUTER}#exported", f"{ROUTER}#arrow"),
        (f"{ROUTER}#overloaded", f"{UTIL}#helper"),
    ]


def test_types_decorators_and_base_classes_are_not_calls(conversion: Conversion) -> None:
    assert (f"{ROUTER}#Router.typed", f"{ROUTER}#Router") not in conversion.edges
    assert (f"{ROUTER}#Router.handle", "src/core/hidden.ts#Logged") not in conversion.edges
    assert (f"{ROUTER}#Router", f"{ROUTER}#Base") not in conversion.edges
    assert conversion.stats.references_not_calls > 0


def test_every_body_of_an_overload_counts(conversion: Conversion) -> None:
    overloaded = _record(conversion, f"{ROUTER}#overloaded")
    assert len(overloaded.bodies) == 2
    assert _lines(overloaded) == (16, 20)  # the signatures through the implementation
    assert (f"{ROUTER}#overloaded", f"{UTIL}#helper") in conversion.edges


def test_every_occurrence_and_edge_resolves_to_a_symbol(conversion: Conversion) -> None:
    ids = {symbol.symbol_id for symbol in conversion.symbols}
    assert {occurrence.symbol_id for occurrence in conversion.occurrences} <= ids
    assert {symbol_id for edge in conversion.edges for symbol_id in edge} <= ids


def test_end_col_is_past_the_token(conversion: Conversion) -> None:
    occurrence = next(
        o for o in conversion.occurrences if o.symbol_id == f"{UTIL}#helper" and o.line == 8
    )
    assert occurrence.end_col - occurrence.col == len("helper")


def test_typescript_field_arrow_body_is_its_value() -> None:
    source = b"class A {\n  run = () => { go(); };\n}\n"
    extent = SourceExtents("x.ts", source).find(1, 2)
    assert extent is not None
    assert extent.is_function
    assert (extent.span.start_col, extent.body.start_col) == (2, 8)


def test_typescript_getter_is_a_function() -> None:
    extent = SourceExtents("x.ts", b"class A {\n  get b() { return 1; }\n}\n").find(1, 6)
    assert extent is not None
    assert extent.is_function


def test_tsx_files_parse_as_tsx() -> None:
    extent = SourceExtents("x.tsx", b"const A = () => <div />;\n").find(0, 6)
    assert extent is not None
    assert extent.is_function


def test_a_parameter_does_not_name_the_function_holding_it() -> None:
    extents = SourceExtents("x.ts", b"function f(o: { a: string }) {}\n")
    assert extents.find(0, 11) is None  # o
    member = extents.find(0, 16)  # a names its own signature, not f
    assert member is not None
    assert not member.is_function
    assert member.span.start_col == 16


def test_type_positions_are_non_calls() -> None:
    extents = SourceExtents("x.ts", b"function f(a: Foo): Bar<Baz> { return new Foo(); }\n")
    assert extents.is_non_call(0, 14)  # a: Foo
    assert extents.is_non_call(0, 20)  # Bar
    assert extents.is_non_call(0, 24)  # Baz
    assert not extents.is_non_call(0, 42)  # new Foo()


def test_decorators_and_heritage_are_non_calls() -> None:
    extents = SourceExtents("x.ts", b"@Dec()\nclass A extends B {}\n")
    assert extents.is_non_call(0, 1)
    assert extents.is_non_call(1, 16)
