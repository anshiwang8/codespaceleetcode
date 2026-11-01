"""Answer syntax questions about an exact position in a source file.

scip-typescript emits no enclosing range for `Layer.prototype.match = function () {}`, getters, or
`handle = () => {}` class fields. scip-python's ranges cover a function's decorators and
annotations, which aren't part of what it runs. SCIP still decides what a symbol is and what refers
to it. tree-sitter only answers two questions: given the exact position of a SCIP definition, which
syntax node does it name, and where does that node end? And is a SCIP reference in a type, not in
code? No names are looked up or matched here.
"""

from dataclasses import dataclass
from pathlib import PurePosixPath

import tree_sitter_javascript
import tree_sitter_python
import tree_sitter_typescript
from tree_sitter import Language, Node, Parser

from ingest.scip_parse import Span

_FUNCTION_DEFINITIONS = frozenset(
    {
        "abstract_class_declaration",
        "class_declaration",
        "function_declaration",
        "generator_function_declaration",
        "method_definition",
    }
)
# Python's definitions run only their block: decorators, annotations and base classes are evaluated
# by whatever encloses the definition.
_BLOCK_DEFINITIONS = frozenset({"class_definition", "function_definition"})
# TypeScript declarations that nothing calls as a whole. Their kinds come from SCIP.
_OTHER_DEFINITIONS = frozenset(
    {
        "abstract_method_signature",
        "enum_assignment",
        "function_signature",
        "internal_module",
        "method_signature",
        "module",
        "property_signature",
    }
)
# Where a definition's value lives, by the node type the definition's name sits in.
_VALUE_FIELDS = {
    "assignment": "right",
    "assignment_expression": "right",
    "field_definition": "value",
    "pair": "value",
    "public_field_definition": "value",
    "variable_declarator": "value",
}
# The first of these fields a node has is where its name is.
_NAME_FIELDS = ("name", "left", "key", "property")
_FUNCTION_VALUES = frozenset(
    {"arrow_function", "class", "function", "function_expression", "generator_function", "lambda"}
)
# A reference inside one of these is evaluated at definition time or isn't evaluated at all. Either
# way it isn't a call made by the enclosing function.
_ECMASCRIPT_NON_CALLS = frozenset(
    {
        "class_heritage",
        "decorator",
        "type_annotation",
        "type_arguments",
        "type_identifier",
        "type_parameters",
        "type_query",
    }
)
_PYTHON_NON_CALLS = frozenset({"type"})

_JAVASCRIPT = Parser(Language(tree_sitter_javascript.language()))
_TYPESCRIPT = Parser(Language(tree_sitter_typescript.language_typescript()))
_TSX = Parser(Language(tree_sitter_typescript.language_tsx()))
_PYTHON = Parser(Language(tree_sitter_python.language()))
_PARSERS = {
    ".cjs": _JAVASCRIPT,
    ".cts": _TYPESCRIPT,
    ".js": _JAVASCRIPT,
    ".jsx": _JAVASCRIPT,
    ".mjs": _JAVASCRIPT,
    ".mts": _TYPESCRIPT,
    ".py": _PYTHON,
    ".pyi": _PYTHON,
    ".ts": _TYPESCRIPT,
    ".tsx": _TSX,
}


@dataclass(frozen=True)
class Extent:
    """span is the whole definition. body is what runs when it's called, for call edges: it leaves
    out the left side of `View.prototype.lookup = function () {}`, which is not a reference made
    by the function."""

    span: Span
    body: Span
    is_function: bool


@dataclass(frozen=True)
class PropertyAssignment:
    """One target of a top-level `root.name = function () {}` statement."""

    root_name: str
    root_line: int
    root_col: int
    property_name: str
    property_line: int
    property_col: int
    property_end_col: int


class SourceExtents:
    """Syntax for one source file. Positions are 0-based, with UTF-16 columns as in SCIP."""

    def __init__(self, path: str, source: bytes | None) -> None:
        parser = _PARSERS.get(PurePosixPath(path).suffix.lower())
        self.is_python = parser is _PYTHON
        self._is_javascript = parser is _JAVASCRIPT
        self._non_calls = _PYTHON_NON_CALLS if self.is_python else _ECMASCRIPT_NON_CALLS
        self._lines = source.split(b"\n") if source is not None else []
        self._root = parser.parse(source).root_node if parser and source is not None else None

    def find(self, line: int, col: int) -> Extent | None:
        """Return the definition named by the token at this position, if it names one."""
        node = self._definition_named_at(line, col)
        return self._extent(node) if node is not None else None

    def redefines(self, line: int, col: int) -> bool:
        """Whether a SCIP reference here is really another definition of its symbol.

        scip-python gives one symbol a definition role only at its first `def`. An `@overload`'s
        implementation or a property's setter is a reference sitting on a `def` name.
        """
        node = self._definition_named_at(line, col) if self.is_python else None
        return node is not None and node.type in _BLOCK_DEFINITIONS

    def is_non_call(self, line: int, col: int) -> bool:
        """Whether a reference here is a type, decorator, base class or repeated definition."""
        if self.redefines(line, col):
            return True
        node = self._node_at(line, col)
        while node is not None:
            if node.type in self._non_calls:
                return True
            node = node.parent
        return False

    def line_end_col(self, line: int) -> int | None:
        """The line's length, without its line ending. None if the source isn't available."""
        if line >= len(self._lines):
            return None
        return _byte_to_utf16(self._lines[line].rstrip(b"\r"), len(self._lines[line]))

    def function_property_assignments(self) -> list[PropertyAssignment]:
        """Return each `root.name` target of a top-level assignment whose value is a function.

        Computed targets (`app[method] = ...`) and deeper chains (`a.b.c = ...`) don't qualify.
        """
        if self._root is None or not self._is_javascript:
            return []
        found: list[PropertyAssignment] = []
        for statement in self._root.named_children:
            assignment = statement.named_children[0] if statement.named_children else None
            if statement.type != "expression_statement" or assignment is None:
                continue
            value = _final_value(assignment)
            if value is None or value.type not in _FUNCTION_VALUES:
                continue
            current: Node | None = assignment
            while current is not None and current.type == "assignment_expression":
                target = self._property_target(current.child_by_field_name("left"))
                if target is not None:
                    found.append(target)
                current = current.child_by_field_name("right")
        return found

    def _definition_named_at(self, line: int, col: int) -> Node | None:
        token = self._node_at(line, col)
        node = token
        while node is not None:
            if (
                node.type in _FUNCTION_DEFINITIONS
                or node.type in _BLOCK_DEFINITIONS
                or node.type in _OTHER_DEFINITIONS
                or node.type in _VALUE_FIELDS
            ):
                # Any further out is a definition this token is merely inside, like a function
                # holding the variable or the destructured parameter named here.
                return node if _is_named_by(node, token) else None
            node = node.parent
        return None

    def _node_at(self, line: int, col: int) -> Node | None:
        if self._root is None or line >= len(self._lines):
            return None
        point = (line, _utf16_to_byte(self._lines[line], col))
        return self._root.descendant_for_point_range(point, point)

    def _extent(self, node: Node) -> Extent:
        span = self._span(node)
        if node.type in _FUNCTION_DEFINITIONS:
            return Extent(span, span, is_function=True)
        if node.type in _BLOCK_DEFINITIONS:
            block = node.child_by_field_name("body")
            return Extent(span, self._span(block) if block else span, is_function=True)
        if node.type in _VALUE_FIELDS:
            value = _final_value(node)
            if value is not None and value.type in _FUNCTION_VALUES:
                return Extent(span, self._span(value), is_function=True)
        return Extent(span, span, is_function=False)

    def _property_target(self, left: Node | None) -> PropertyAssignment | None:
        if left is None or left.type != "member_expression":
            return None
        root = left.child_by_field_name("object")
        name = left.child_by_field_name("property")
        if (
            root is None
            or name is None
            or root.type != "identifier"
            or root.text is None
            or name.text is None
        ):
            return None
        root_span = self._span(root)
        name_span = self._span(name)
        return PropertyAssignment(
            root_name=root.text.decode("utf-8"),
            root_line=root_span.start_line,
            root_col=root_span.start_col,
            property_name=name.text.decode("utf-8"),
            property_line=name_span.start_line,
            property_col=name_span.start_col,
            property_end_col=name_span.end_col,
        )

    def _span(self, node: Node) -> Span:
        start_line, start_byte = node.start_point
        end_line, end_byte = node.end_point
        return Span(
            start_line,
            _byte_to_utf16(self._lines[start_line], start_byte),
            end_line,
            _byte_to_utf16(self._lines[end_line], end_byte),
        )


def _is_named_by(definition: Node, token: Node | None) -> bool:
    name = next(
        (
            node
            for field in _NAME_FIELDS
            if (node := definition.child_by_field_name(field)) is not None
        ),
        None,
    )
    if name is None or token is None:
        return True  # Anonymous, like `export default function () {}`.
    return name.start_byte <= token.start_byte and token.end_byte <= name.end_byte


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
