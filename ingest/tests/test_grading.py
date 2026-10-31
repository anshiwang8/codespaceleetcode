"""Spec section 3's grading rules, as used by blind-check."""

import pytest

from ingest.grading import is_correct, shape_problem
from ingest.puzzles import (
    Answer,
    ChoiceAnswer,
    FileAnswer,
    LocationAnswer,
    SequenceAnswer,
    SetAnswer,
    SymbolAnswer,
)

SYMBOL = SymbolAnswer("a.js#A.run", ("b.js#run",), ("A re-export.",))
FILE = FileAnswer("a.js", ("b.js",), ("A re-export.",))
LOCATION = LocationAnswer("a.js", (10, 12), (8, 20))
SEQUENCE = SequenceAnswer(("a", "b", "c"), (("a", "d", "c"),), ("Either branch.",))
SET = SetAnswer(("a.js", "b.js", "c.js"))
CHOICE = ChoiceAnswer("b")


@pytest.mark.parametrize(
    ("answer", "submission", "correct"),
    [
        (SYMBOL, {"kind": "symbol", "id": "a.js#A.run"}, True),
        (SYMBOL, {"kind": "symbol", "id": "b.js#run"}, True),
        (SYMBOL, {"kind": "symbol", "id": "c.js#A.run"}, False),
        (SYMBOL, {"kind": "symbol", "id": "A.JS#A.RUN"}, False),
        (SYMBOL, {"kind": "symbol", "id": " a.js#A.run"}, False),
        (SYMBOL, {"kind": "symbol", "id": "a.js#A.run~2"}, False),
        (FILE, {"kind": "file", "path": "a.js"}, True),
        (FILE, {"kind": "file", "path": "b.js"}, True),
        (FILE, {"kind": "file", "path": "c.js"}, False),
        (FILE, {"kind": "file", "path": "./a.js"}, False),
        (LOCATION, {"kind": "location", "id": "a.js:L10-L12"}, True),
        (LOCATION, {"kind": "location", "id": "a.js:L8-L20"}, True),
        (LOCATION, {"kind": "location", "id": "b.js:L10-L12"}, False),
        (LOCATION, {"kind": "location", "id": "a.js:L11-L12"}, False),
        (LOCATION, {"kind": "location", "id": "a.js:L10-L11"}, False),
        (LOCATION, {"kind": "location", "id": "a.js:L7-L12"}, False),
        (LOCATION, {"kind": "location", "id": "a.js:L10-L21"}, False),
        (SEQUENCE, {"kind": "sequence", "ids": ["a", "b", "c"]}, True),
        (SEQUENCE, {"kind": "sequence", "ids": ["a", "d", "c"]}, True),
        (SEQUENCE, {"kind": "sequence", "ids": ["b", "a", "c"]}, False),
        (SEQUENCE, {"kind": "sequence", "ids": ["a", "b"]}, False),
        (SEQUENCE, {"kind": "sequence", "ids": ["a", "b", "c", "c"]}, False),
        (SET, {"kind": "set", "ids": ["c.js", "a.js", "b.js"]}, True),
        (SET, {"kind": "set", "ids": ["a.js", "b.js"]}, False),
        (SET, {"kind": "set", "ids": ["a.js", "b.js", "c.js", "d.js"]}, False),
        (SET, {"kind": "set", "ids": ["a.js", "b.js", "d.js"]}, False),
        (CHOICE, {"kind": "choice", "option": "b"}, True),
        (CHOICE, {"kind": "choice", "option": "B"}, False),
        (CHOICE, {"kind": "choice", "option": "a"}, False),
    ],
)
def test_is_correct(answer: Answer, submission: object, correct: bool) -> None:
    assert is_correct(answer, submission) is correct


def test_time_on_puzzle_is_ignored() -> None:
    assert is_correct(CHOICE, {"kind": "choice", "option": "b", "timeOnPuzzleMs": 1200})


@pytest.mark.parametrize(
    ("answer", "submission"),
    [
        (SYMBOL, "a.js#A.run"),
        (SYMBOL, {"kind": "file", "path": "a.js"}),
        (SYMBOL, {"kind": "symbol"}),
        (SYMBOL, {"kind": "symbol", "id": 3}),
        (FILE, {"kind": "file", "id": "a.js"}),
        (LOCATION, {"kind": "location", "id": "a.js"}),
        (LOCATION, {"kind": "location", "id": "a.js:L12-L10"}),
        (LOCATION, {"kind": "location", "id": "a.js:L010-L012"}),
        (LOCATION, {"kind": "location", "id": "a.js:L0-L12"}),
        (SEQUENCE, {"kind": "sequence", "ids": "a,b,c"}),
        (SEQUENCE, {"kind": "sequence", "ids": ["a", 1]}),
        (SET, {"kind": "sequence", "ids": ["a.js", "b.js", "c.js"]}),
        (CHOICE, {"kind": "choice"}),
    ],
)
def test_malformed_submissions_are_flagged_and_wrong(answer: Answer, submission: object) -> None:
    assert shape_problem(answer.kind, submission) is not None
    assert not is_correct(answer, submission)
