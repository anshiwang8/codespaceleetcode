"""Read index.scip and decode its ranges. Lines and columns here are 0-based, as in SCIP."""

from dataclasses import dataclass
from pathlib import Path

from ingest.errors import IngestError
from ingest.proto import scip_pb2

DEFINITION_ROLE = scip_pb2.SymbolRole.Definition


@dataclass(frozen=True, order=True)
class Span:
    """A half-open [start, end) source range."""

    start_line: int
    start_col: int
    end_line: int
    end_col: int

    def contains(self, line: int, col: int) -> bool:
        return (self.start_line, self.start_col) <= (line, col) < (self.end_line, self.end_col)

    @property
    def last_line(self) -> int:
        """The last line the span touches. An end at column 0 stops before that line."""
        return self.end_line if self.end_col > 0 else max(self.start_line, self.end_line - 1)


def load_index(path: Path) -> scip_pb2.Index:
    index = scip_pb2.Index()
    try:
        index.ParseFromString(path.read_bytes())
    except Exception as error:
        raise IngestError(f"Could not parse {path} as a SCIP index: {error}") from error
    return index


def normalize_path(relative_path: str) -> str:
    """scip-typescript writes backslashes on Windows. Snapshot paths always use forward slashes."""
    return relative_path.replace("\\", "/")


def occurrence_span(occurrence: scip_pb2.Occurrence) -> Span:
    match occurrence.WhichOneof("typed_range"):
        case "single_line_range":
            return _single_line(occurrence.single_line_range)
        case "multi_line_range":
            return _multi_line(occurrence.multi_line_range)
        case _:
            return _from_legacy(list(occurrence.range))


def enclosing_span(occurrence: scip_pb2.Occurrence) -> Span | None:
    match occurrence.WhichOneof("typed_enclosing_range"):
        case "single_line_enclosing_range":
            return _single_line(occurrence.single_line_enclosing_range)
        case "multi_line_enclosing_range":
            return _multi_line(occurrence.multi_line_enclosing_range)
        case _:
            return (
                _from_legacy(list(occurrence.enclosing_range))
                if occurrence.enclosing_range
                else None
            )


def _single_line(value: scip_pb2.SingleLineRange) -> Span:
    return Span(value.line, value.start_character, value.line, value.end_character)


def _multi_line(value: scip_pb2.MultiLineRange) -> Span:
    return Span(value.start_line, value.start_character, value.end_line, value.end_character)


def _from_legacy(values: list[int]) -> Span:
    match values:
        case [line, start, end]:
            return Span(line, start, line, end)
        case [start_line, start_col, end_line, end_col]:
            return Span(start_line, start_col, end_line, end_col)
        case _:
            raise IngestError(f"SCIP range must have 3 or 4 elements, got: {values}")
