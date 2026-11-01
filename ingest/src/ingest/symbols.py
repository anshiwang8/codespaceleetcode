"""Parse SCIP symbol strings and build canonical IDs: path#Qualified.name[~N]."""

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import PurePosixPath

from ingest.errors import IngestError


class Suffix(StrEnum):
    NAMESPACE = "namespace"
    TYPE = "type"
    TERM = "term"
    META = "meta"
    MACRO = "macro"
    METHOD = "method"
    TYPE_PARAMETER = "type_parameter"
    PARAMETER = "parameter"


_SIMPLE_SUFFIXES = {
    "/": Suffix.NAMESPACE,
    "#": Suffix.TYPE,
    ".": Suffix.TERM,
    ":": Suffix.META,
    "!": Suffix.MACRO,
}
_NOT_A_NAMED_SYMBOL = frozenset({Suffix.PARAMETER, Suffix.TYPE_PARAMETER, Suffix.META})
_PYTHON_SUFFIXES = frozenset({".py", ".pyi"})


@dataclass(frozen=True)
class Descriptor:
    name: str
    suffix: Suffix


def is_local(symbol: str) -> bool:
    return symbol.startswith("local ")


def parse_descriptors(symbol: str) -> list[Descriptor]:
    """Parse a global symbol per the grammar in scip.proto, dropping scheme and package."""
    if is_local(symbol):
        raise IngestError(f"Local symbols have no descriptors: {symbol}")
    position = 0
    for _ in range(4):  # scheme, manager, package name, version
        position = _skip_header_field(symbol, position)
    descriptors: list[Descriptor] = []
    while position < len(symbol):
        descriptor, position = _parse_descriptor(symbol, position)
        descriptors.append(descriptor)
    if not descriptors:
        raise IngestError(f"SCIP symbol has no descriptors: {symbol}")
    return descriptors


def qualified_name(descriptors: Iterable[Descriptor], path: str) -> str | None:
    """Return the dotted name inside a file, or None if the symbol can't be a puzzle answer.

    None covers the file itself, parameters, type parameters, and meta descriptors:
    scip-typescript's `weak0:`, whose names carry a counter rather than a stable identity, and
    scip-python's `__init__:`, which stands for the module.
    """
    remaining = _strip_file_namespaces(list(descriptors), path)
    if not remaining or remaining[-1].suffix in _NOT_A_NAMED_SYMBOL:
        return None
    return ".".join(descriptor.name for descriptor in remaining)


def short_name(qualified: str) -> str:
    # scip-typescript marks accessors and constructors in the name, as in `Router.<get>size`.
    name = qualified.rsplit(".", 1)[-1]
    return name.removeprefix("<get>").removeprefix("<set>").removeprefix("<").removesuffix(">")


class CanonicalIds:
    """Hands out IDs. Call in source order: the first holder of a name stays bare, then ~2, ~3."""

    def __init__(self) -> None:
        self._seen: Counter[tuple[str, str]] = Counter()

    def assign(self, path: str, qualified: str) -> str:
        self._seen[(path, qualified)] += 1
        count = self._seen[(path, qualified)]
        suffix = "" if count == 1 else f"~{count}"
        return f"{path}#{qualified}{suffix}"


def _strip_file_namespaces(descriptors: list[Descriptor], path: str) -> list[Descriptor]:
    # scip-python encodes the module as one dotted namespace: `requests.sessions`/. Python has no
    # other namespaces, so the first one is always the module, whatever root pyright resolved it to.
    if PurePosixPath(path).suffix in _PYTHON_SUFFIXES:
        first_is_module = bool(descriptors) and descriptors[0].suffix is Suffix.NAMESPACE
        return descriptors[1:] if first_is_module else descriptors
    # scip-typescript encodes the path as leading namespaces, one per part: lib/`application.js`/.
    # They start at the nearest package.json, so in a monorepo they're only the path's tail.
    parts = path.split("/")
    for count in range(1, len(parts) + 1):
        leading = descriptors[:count]
        if [(d.name, d.suffix) for d in leading] == [(p, Suffix.NAMESPACE) for p in parts[-count:]]:
            return descriptors[count:]
    return descriptors


def _skip_header_field(symbol: str, position: int) -> int:
    # A double space escapes a literal space inside a header field.
    while position < len(symbol):
        if symbol[position] != " ":
            position += 1
        elif symbol[position + 1 : position + 2] == " ":
            position += 2
        else:
            return position + 1
    raise IngestError(f"SCIP symbol header is incomplete: {symbol}")


def _parse_descriptor(symbol: str, position: int) -> tuple[Descriptor, int]:
    if symbol[position] == "(":
        name, position = _parse_name(symbol, position + 1)
        return Descriptor(name, Suffix.PARAMETER), _expect(symbol, position, ")")
    if symbol[position] == "[":
        name, position = _parse_name(symbol, position + 1)
        return Descriptor(name, Suffix.TYPE_PARAMETER), _expect(symbol, position, "]")

    name, position = _parse_name(symbol, position)
    next_char = symbol[position : position + 1]
    if next_char in _SIMPLE_SUFFIXES and next_char:
        return Descriptor(name, _SIMPLE_SUFFIXES[next_char]), position + 1
    if next_char == "(":
        closing = symbol.find(").", position)
        if closing == -1:
            raise IngestError(f"Unterminated method descriptor in SCIP symbol: {symbol}")
        return Descriptor(name, Suffix.METHOD), closing + 2
    raise IngestError(f"Unexpected suffix at offset {position} in SCIP symbol: {symbol}")


def _parse_name(symbol: str, position: int) -> tuple[str, int]:
    if symbol[position : position + 1] == "`":
        return _parse_escaped_name(symbol, position + 1)
    start = position
    while position < len(symbol) and (symbol[position].isalnum() or symbol[position] in "_+-$"):
        position += 1
    if position == start:
        raise IngestError(f"Expected a name at offset {position} in SCIP symbol: {symbol}")
    return symbol[start:position], position


def _parse_escaped_name(symbol: str, position: int) -> tuple[str, int]:
    characters: list[str] = []
    while position < len(symbol):
        if symbol[position] != "`":
            characters.append(symbol[position])
            position += 1
        elif symbol[position + 1 : position + 2] == "`":
            characters.append("`")
            position += 2
        else:
            return "".join(characters), position + 1
    raise IngestError(f"Unterminated escaped name in SCIP symbol: {symbol}")


def _expect(symbol: str, position: int, character: str) -> int:
    if symbol[position : position + 1] != character:
        raise IngestError(f"Expected '{character}' at offset {position} in SCIP symbol: {symbol}")
    return position + 1
