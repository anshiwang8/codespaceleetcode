import pytest

from ingest.convert import convert_index
from ingest.errors import IngestError
from ingest.proto import scip_pb2
from ingest.scip_parse import normalize_path
from ingest.symbols import (
    CanonicalIds,
    Descriptor,
    Suffix,
    parse_descriptors,
    qualified_name,
    short_name,
)

PREFIX = "scip-typescript npm express 5.3.0 "


def _qualified(descriptors: str, path: str = "lib/router/index.js") -> str | None:
    return qualified_name(parse_descriptors(PREFIX + descriptors), path)


def test_parse_descriptors_covers_every_suffix() -> None:
    parsed = parse_descriptors(PREFIX + "lib/`a.js`/Router#handle(+1).(req)[T]meta:mac!term.")
    assert parsed == [
        Descriptor("lib", Suffix.NAMESPACE),
        Descriptor("a.js", Suffix.NAMESPACE),
        Descriptor("Router", Suffix.TYPE),
        Descriptor("handle", Suffix.METHOD),
        Descriptor("req", Suffix.PARAMETER),
        Descriptor("T", Suffix.TYPE_PARAMETER),
        Descriptor("meta", Suffix.META),
        Descriptor("mac", Suffix.MACRO),
        Descriptor("term", Suffix.TERM),
    ]


def test_parse_handles_escaped_names_and_header_spaces() -> None:
    parsed = parse_descriptors("scip  x npm my  pkg 1.0 `we``ird name`#")
    assert parsed == [Descriptor("we`ird name", Suffix.TYPE)]


@pytest.mark.parametrize(
    "broken", ["only three fields", PREFIX, PREFIX + "unterminated`/", PREFIX + "name", "local 5"]
)
def test_parse_rejects_malformed_symbols(broken: str) -> None:
    with pytest.raises(IngestError):
        parse_descriptors(broken)


@pytest.mark.parametrize(
    ("descriptors", "expected"),
    [
        ("lib/router/`index.js`/Router#handle().", "Router.handle"),
        ("lib/router/`index.js`/View().lookup.", "View.lookup"),
        ("lib/router/`index.js`/createApplication().", "createApplication"),
        ("lib/router/`index.js`/Inner/thing.", "Inner.thing"),
        ("lib/router/`index.js`/", None),
        ("lib/router/`index.js`/View().(name)", None),
        ("lib/router/`index.js`/Box#[T]", None),
        ("lib/router/`index.js`/weak0:", None),
    ],
)
def test_qualified_name(descriptors: str, expected: str | None) -> None:
    assert _qualified(descriptors) == expected


PYTHON_PREFIX = "scip-python python snapshot 0 "


@pytest.mark.parametrize(
    ("descriptors", "path", "expected"),
    [
        ("`requests.sessions`/Session#send().", "requests/sessions.py", "Session.send"),
        ("`src.requests.sessions`/Session#send().", "src/requests/sessions.py", "Session.send"),
        ("requests/check().", "requests/__init__.py", "check"),
        ("top/main().", "top.py", "main"),
        ("`a.b`/f().g().", "a/b.py", "f.g"),
        ("`a.b`/C#D#run().", "a/b.py", "C.D.run"),
        ("`a.b`/C#attr.", "a/b.pyi", "C.attr"),
        ("`a.b`/__init__:", "a/b.py", None),
        ("`a.b`/C#__init__().", "a/b.py", "C.__init__"),
        ("`a.b`/f().(x)", "a/b.py", None),
    ],
)
def test_python_module_namespace_is_stripped(
    descriptors: str, path: str, expected: str | None
) -> None:
    parsed = parse_descriptors(PYTHON_PREFIX + descriptors)
    assert qualified_name(parsed, path) == expected


@pytest.mark.parametrize(
    ("descriptors", "path", "expected"),
    [
        ("packages/core/src/`index.ts`/run().", "packages/core/src/index.ts", "run"),
        ("src/`index.ts`/run().", "packages/core/src/index.ts", "run"),
        ("`index.ts`/run().", "packages/core/index.ts", "run"),
        ("src/`index.ts`/Tools/tool().", "packages/core/src/index.ts", "Tools.tool"),
        # A namespace that merely shares a directory's name isn't the file's path.
        ("src/run().", "packages/src/index.ts", "src.run"),
    ],
)
def test_typescript_namespaces_can_start_at_a_nested_package(
    descriptors: str, path: str, expected: str
) -> None:
    assert qualified_name(parse_descriptors(PREFIX + descriptors), path) == expected


@pytest.mark.parametrize(
    ("qualified", "name"),
    [
        ("Router.handle", "handle"),
        ("Router.<get>size", "size"),
        ("Router.<set>size", "size"),
        ("Router.<constructor>", "constructor"),
        ("run", "run"),
        ("Hono.#dispatch", "#dispatch"),
    ],
)
def test_short_name(qualified: str, name: str) -> None:
    assert short_name(qualified) == name


def test_canonical_ids_suffix_collisions_within_a_file_only() -> None:
    ids = CanonicalIds()
    assert ids.assign("a.js", "run") == "a.js#run"
    assert ids.assign("a.js", "run") == "a.js#run~2"
    assert ids.assign("a.js", "run") == "a.js#run~3"
    assert ids.assign("a.js", "stop") == "a.js#stop"
    assert ids.assign("b.js", "run") == "b.js#run"


def _document(path: str, definitions: list[tuple[str, int]]) -> scip_pb2.Document:
    document = scip_pb2.Document(relative_path=path)
    for symbol, line in definitions:
        document.occurrences.add(
            symbol=symbol, symbol_roles=scip_pb2.SymbolRole.Definition, range=[line, 9, 12]
        )
        document.symbols.add(symbol=symbol, kind=scip_pb2.SymbolInformation.Function)
    return document


def test_collisions_are_numbered_in_source_order_not_stored_order() -> None:
    # Overloads are distinct SCIP symbols with the same qualified name. Stored order is reversed.
    index = scip_pb2.Index(
        documents=[
            _document(
                "a.ts",
                [
                    (PREFIX + "`a.ts`/run(+2).", 30),
                    (PREFIX + "`a.ts`/run(+1).", 20),
                    (PREFIX + "`a.ts`/run().", 10),
                ],
            )
        ]
    )
    symbols = convert_index(index, lambda _: None).symbols
    assert [(s.symbol_id, s.span.start_line) for s in symbols] == [
        ("a.ts#run", 10),
        ("a.ts#run~2", 20),
        ("a.ts#run~3", 30),
    ]


def test_same_scip_symbol_defined_twice_gets_one_id_at_its_first_definition() -> None:
    symbol = PREFIX + "`a.ts`/run()."
    index = scip_pb2.Index(documents=[_document("a.ts", [(symbol, 30), (symbol, 10)])])
    conversion = convert_index(index, lambda _: None)
    assert [(s.symbol_id, s.span.start_line) for s in conversion.symbols] == [("a.ts#run", 10)]
    assert [(o.line, o.role) for o in conversion.occurrences] == [
        (11, "definition"),
        (31, "definition"),
    ]


def test_windows_paths_become_forward_slashes_in_ids() -> None:
    assert normalize_path("lib\\router\\index.js") == "lib/router/index.js"
    symbol = PREFIX + "lib/`a.js`/run()."
    index = scip_pb2.Index(documents=[_document("lib\\a.js", [(symbol, 1)])])
    assert convert_index(index, lambda _: None).symbols[0].symbol_id == "lib/a.js#run"
