"""Spec section 3's grading rules. Exact ID comparison only (CLAUDE.md rule 2)."""

import re
from typing import cast

from ingest.puzzles import (
    Answer,
    ChoiceAnswer,
    FileAnswer,
    LocationAnswer,
    SequenceAnswer,
    SetAnswer,
    SymbolAnswer,
)

# Line terminators match what `.` excludes in web/lib/server/grader.ts. The digit limit keeps both
# graders within safe integers, and stops int() raising on an absurdly long number.
_LOCATION_ID = re.compile(
    r"(?P<path>[^\n\r\u2028\u2029]+):L(?P<first>[1-9][0-9]{0,14})-L(?P<last>[1-9][0-9]{0,14})"
)
_SHAPES = {
    "symbol": 'a string "id"',
    "file": 'a string "path"',
    "location": 'an "id" of the form path:Lstart-Lend',
    "sequence": 'a list of strings "ids"',
    "set": 'a list of strings "ids"',
    "choice": 'a string "option"',
}


def shape_problem(kind: str, submission: object) -> str | None:
    """Say what's malformed about a submission. Depends only on the kind, which solvers can see."""
    expected = f'needs "kind": "{kind}" and {_SHAPES[kind]}'
    if not isinstance(submission, dict):
        return expected
    fields = cast(dict[str, object], submission)
    if fields.get("kind") != kind:
        return expected
    match kind:
        case "symbol":
            valid = isinstance(fields.get("id"), str)
        case "file":
            valid = isinstance(fields.get("path"), str)
        case "location":
            valid = _parse_location(fields.get("id")) is not None
        case "sequence" | "set":
            valid = _string_list(fields.get("ids")) is not None
        case _:
            valid = isinstance(fields.get("option"), str)
    return None if valid else expected


def is_correct(answer: Answer, submission: object) -> bool:
    if shape_problem(answer.kind, submission) is not None:
        return False
    fields = cast(dict[str, object], submission)
    match answer:
        case SymbolAnswer():
            return fields["id"] == answer.id or fields["id"] in answer.accept
        case FileAnswer():
            return fields["path"] == answer.path or fields["path"] in answer.accept
        case LocationAnswer():
            return _location_is_correct(answer, fields["id"])
        case SequenceAnswer():
            ids = tuple(_string_list(fields["ids"]) or ())
            return ids == answer.ids or ids in answer.accept_sequences
        case SetAnswer():
            ids = _string_list(fields["ids"]) or []
            # A duplicate is wrong even if the members match, as in web/lib/server/grader.ts.
            return len(ids) == len(set(ids)) and set(ids) == set(answer.ids)
        case ChoiceAnswer():
            return fields["option"] == answer.option


def _location_is_correct(answer: LocationAnswer, submitted: object) -> bool:
    parsed = _parse_location(submitted)
    if parsed is None:
        return False
    path, first, last = parsed
    return (
        path == answer.path
        and first <= answer.anchor[0]
        and last >= answer.anchor[1]
        and first >= answer.window[0]
        and last <= answer.window[1]
    )


def _parse_location(value: object) -> tuple[str, int, int] | None:
    if not isinstance(value, str):
        return None
    match = _LOCATION_ID.fullmatch(value)
    if match is None or int(match["first"]) > int(match["last"]):
        return None
    return match["path"], int(match["first"]), int(match["last"])


def _string_list(value: object) -> list[str] | None:
    if not isinstance(value, list):
        return None
    items = cast(list[object], value)
    return cast(list[str], items) if all(isinstance(item, str) for item in items) else None
