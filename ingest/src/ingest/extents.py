"""Find where a definition's body ends when SCIP doesn't say.

scip-typescript emits no enclosing range for `Layer.prototype.match = function () {}`. SCIP still
decides what the symbol is and what refers to it. tree-sitter only answers one question: given the
exact position of a SCIP definition, which syntax node does it name, and where does that node end?
No names are looked up or matched here.
"""

from dataclasses import dataclass
from pathlib import PurePosixPath

import tree_sitter_javascript
from tree_sitter import Language, Node, Parser

from ingest.scip_parse import Span

_JAVASCRIPT_SUFFIXES = frozenset({".cjs", ".js", ".jsx", ".mjs"})
_FUNCTION_DEFINITIONS = frozenset(
    {
        "class_declaration",
        "function_declaration",
        "generator_function_declaration",
        "method_definition",
    }
)
# Where a definition's value lives, by the node type the definition's name sits in.
_VALUE_FIELDS = {
    "assignment_expression": "right",
    "field_definition": "value",
    "pair": "value",
    "variable_declarator": "value",
}
_FUNCTION_VALUES = frozenset(
    {"arrow_function", "class", "function", "function_expression", "generator_function"}
)

_PARSER = Parser(Language(tree_sitter_javascript.language()))


@dataclass(frozen=True)
class Extent:
    """span is the whole definition. body is what runs when it's called, for call edges: it leaves
    out the left side of `View.prototype.lookup = function () {}`, which is not a reference made
    by the function."""

    span: Span
    body: Span
    is_function: bool


class SourceExtents:
    """Extents for one source file. Positions are 0-based, with UTF-16 columns as in SCIP."""

    def __init__(self, path: str, source: bytes | None) -> None:
        supported = PurePosixPath(path).suffix.lower() in _JAVASCRIPT_SUFFIXES
        self._lines = source.split(b"\n") if source is not None else []
        self._root = _PARSER.parse(source).root_node if supported and source is not None else None

    def find(self, line: int, col: int) -> Extent | None:
        if self._root is None or line >= len(self._lines):
            return None
        point = (line, _utf16_to_byte(self._lines[line], col))
        node = self._root.descendant_for_point_range(point, point)
        while node is not None:
            if node.type in _FUNCTION_DEFINITIONS:
                span = self._span(node)
                return Extent(span, span, is_function=True)
            if node.type in _VALUE_FIELDS:
                span = self._span(node)
                value = _final_value(node)
                if value is not None and value.type in _FUNCTION_VALUES:
                    return Extent(span, self._span(value), is_function=True)
                return Extent(span, span, is_function=False)
            node = node.parent
        return None

    def _span(self, node: Node) -> Span:
        start_line, start_byte = node.start_point
        end_line, end_byte = node.end_point
        return Span(
            start_line,
            _byte_to_utf16(self._lines[start_line], start_byte),
            end_line,
            _byte_to_utf16(self._lines[end_line], end_byte),
        )


def _final_value(node: Node) -> Node | None:
    # `req.get = req.header = function () {}` chains assignments before reaching the function.
    current: Node | None = node
    while current is not None and current.type in _VALUE_FIELDS:
        current = current.child_by_field_name(_VALUE_FIELDS[current.type])
    return current


def _utf16_to_byte(line: bytes, utf16_col: int) -> int:
    text = line.decode("utf-8", errors="replace")
    units = 0
    for index, character in enumerate(text):
        if units >= utf16_col:
            return len(text[:index].encode("utf-8"))
        units += 2 if ord(character) > 0xFFFF else 1
    return len(line)


def _byte_to_utf16(line: bytes, byte_col: int) -> int:
    return len(line[:byte_col].decode("utf-8", errors="replace").encode("utf-16-le")) // 2
