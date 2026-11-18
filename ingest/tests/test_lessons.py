"""The Learn path's content checks (ingest/src/ingest/lessons.py): one fixture per check."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from ingest import lessons
from ingest.lessons import (
    CONTENT_DIR,
    LessonReport,
    load_course,
    render_generated,
    validate_lessons,
)

LESSON: dict[str, Any] = {
    "slug": "first-lesson",
    "code": "L01",
    "kind": "lesson",
    "revision": 1,
    "title": "First lesson",
    "minutes": 10,
    "summary": "A lesson used only by these tests.",
    "objective": "Read one line.",
    "prerequisites": [],
    "teach": "A value is data.",
    "code_blocks": [{"id": "code", "lang": "js", "source": "let a = 1;\n\nlet b = a;\n"}],
    "example": {"prompt": "Predict `b`.", "blocks": ["code"], "walkthrough": "b is set from a."},
    "practice": ["p-find-001"],
    "references": ["R1"],
    "exercises": [
        {
            "id": "guided",
            "role": "practice",
            "kind": "choice",
            "prompt": "Pick one.",
            "choices": [{"id": "one", "label": "1"}, {"id": "two", "label": "2"}],
            "key": {
                "answer": "one",
                "explanation": "It is 1.",
                "hints": ["Look at line 1."],
                "feedback": {"two": "Not 2."},
            },
        },
        {
            "id": "exit",
            "role": "required",
            "kind": "line",
            "block": "code",
            "prompt": "Select the line that reads `a`.",
            "key": {"answer": 3, "explanation": "Line 3 reads `a`."},
        },
    ],
}

CHECKPOINT: dict[str, Any] = {
    "slug": "c1-check",
    "code": "C1",
    "kind": "checkpoint",
    "revision": 1,
    "title": "A checkpoint",
    "minutes": 5,
    "summary": "A checkpoint used only by these tests.",
    "objective": "Check three things.",
    "prerequisites": ["first-lesson"],
    "exercises": [
        {
            "id": f"item-{index}",
            "role": "required",
            "kind": "choice",
            "prompt": "Pick one.",
            "choices": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
            "review": "first-lesson",
            "key": {"answer": "a", "explanation": "A it is."},
        }
        for index in range(1, 4)
    ],
}

CAPSTONE: dict[str, Any] = {
    "slug": "the-capstone",
    "code": "L02",
    "kind": "capstone",
    "revision": 1,
    "title": "The capstone",
    "minutes": 20,
    "summary": "A capstone used only by these tests.",
    "objective": "Trace it.",
    "prerequisites": ["c1-check"],
    "exercises": [
        {
            "id": f"task-{index}",
            "role": "required",
            "kind": "sequence",
            "prompt": "Order the steps.",
            "candidates": [
                {"id": "start", "label": "`start`"},
                {"id": "middle", "label": "`middle`"},
                {"id": "end", "label": "`end`"},
            ],
            "key": {"answer": ["start", "end"], "explanation": "Start, then end."},
        }
        for index in range(1, 5)
    ],
    "reflection": {"prompt": "Explain it.", "rubric": "One point for each part."},
}

COURSE: dict[str, Any] = {
    "title": "Test course",
    "summary": "For tests.",
    "groups": [
        {
            "id": "group-one",
            "title": "Group one",
            "summary": "The only group.",
            "modules": [
                {
                    "id": "module-one",
                    "title": "Module one",
                    "summary": "The only module.",
                    "lessons": ["first-lesson", "the-capstone"],
                }
            ],
            "checkpoint": "c1-check",
            "checkpoint_before": "the-capstone",
        }
    ],
    "references": {
        "R1": {"title": "A reference", "source": "Someone", "url": "https://example.com/"}
    },
}

PUZZLE: dict[str, Any] = {
    "id": "p-find-001",
    "answer": {"kind": "symbol", "id": "src/secretFile.ts#Router.secretMethod"},
}


def write_content(
    root: Path, mutate: Callable[[dict[str, dict[str, Any]]], None] | None = None
) -> Path:
    files = {
        "course": copy.deepcopy(COURSE),
        "first-lesson": copy.deepcopy(LESSON),
        "c1-check": copy.deepcopy(CHECKPOINT),
        "the-capstone": copy.deepcopy(CAPSTONE),
    }
    if mutate:
        mutate(files)
    (root / "lessons").mkdir(parents=True)
    (root / "puzzles" / "repo").mkdir(parents=True)
    (root / "puzzles" / "repo" / "p-find-001.yaml").write_text(
        yaml.safe_dump(PUZZLE), encoding="utf-8"
    )
    for name, data in files.items():
        file_name = "course.yaml" if name == "course" else f"{name}.yaml"
        (root / "lessons" / file_name).write_text(
            yaml.safe_dump(data, sort_keys=False), encoding="utf-8"
        )
    return root


def problems(
    tmp_path: Path, mutate: Callable[[dict[str, dict[str, Any]]], None] | None = None
) -> list[str]:
    return validate_lessons(write_content(tmp_path, mutate), check_generated=False).problems


def test_the_real_course_passes_and_its_generated_files_are_current() -> None:
    report = validate_lessons(CONTENT_DIR)
    assert report.problems == []
    assert report.lesson_count == 28


def test_the_fixture_course_passes(tmp_path: Path) -> None:
    assert problems(tmp_path) == []


def _set(path: list[str | int], value: Any) -> Callable[[dict[str, dict[str, Any]]], None]:
    def mutate(files: dict[str, dict[str, Any]]) -> None:
        target: Any = files
        for part in path[:-1]:
            target = target[part]
        if value is _DELETE:
            del target[path[-1]]
        else:
            target[path[-1]] = value

    return mutate


_DELETE = object()


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (_set(["first-lesson", "slug"], "other-lesson"), "doesn't match the file name"),
        (_set(["first-lesson", "colour"], "blue"), "schema:"),
        (
            _set(["first-lesson", "exercises", 0, "key", "answer"], "three"),
            "isn't one of its choice ids",
        ),
        (
            _set(["first-lesson", "exercises", 0, "key", "feedback"], {"one": "Right."}),
            "feedback is for wrong choices",
        ),
        (_set(["first-lesson", "exercises", 1, "key", "answer"], 9), "past the end"),
        (_set(["first-lesson", "exercises", 1, "key", "answer"], 2), "is blank"),
        (
            _set(["first-lesson", "exercises", 1, "block"], "nowhere"),
            "isn't one of this lesson's code_blocks",
        ),
        (
            _set(["the-capstone", "exercises", 0, "key", "answer"], ["start", "elsewhere"]),
            "isn't a candidate",
        ),
        (
            _set(["the-capstone", "exercises", 0, "key", "answer"], ["start", "middle", "end"]),
            "at least one candidate",
        ),
        (
            _set(["the-capstone", "exercises", 0, "key", "answer"], ["start", "start"]),
            "uses each step once",
        ),
        (
            _set(["first-lesson", "exercises", 1, "role"], "practice"),
            "has 1 required exercise(s), not 0",
        ),
        (
            _set(["c1-check", "exercises", 2, "role"], "practice"),
            "has 3 required exercise(s), not 2",
        ),
        (_set(["first-lesson", "exercises", 1, "id"], "guided"), "exercise ids must be unique"),
        (_set(["first-lesson", "prerequisites"], ["the-capstone"]), "must come earlier"),
        (_set(["first-lesson", "prerequisites"], ["missing-lesson"]), "isn't in the course"),
        (_set(["first-lesson", "practice"], ["p-find-999"]), "isn't in content/puzzles"),
        (
            _set(["first-lesson", "teach"], "Look at `secretMethod` in the router."),
            "from p-find-001's answer",
        ),
        (
            _set(["first-lesson", "teach"], "Open src/secretFile.ts first."),
            "from p-find-001's answer",
        ),
        (_set(["first-lesson", "references"], ["R9"]), "isn't in course.yaml"),
        (
            _set(["first-lesson", "exercises", 0, "key", "explanation"], "Two\nlines."),
            "must be one line",
        ),
        (_set(["first-lesson", "teach"], "A <script>alert(1)</script> value."), "raw HTML"),
        (_set(["first-lesson", "teach"], "```mermaid\ngraph TD\n```"), "mermaid"),
        (_set(["first-lesson", "teach"], "See [this](javascript:alert)."), "must be https://"),
        (_set(["first-lesson", "example", "blocks"], ["nowhere"]), "example block nowhere"),
        (_set(["the-capstone", "reflection"], _DELETE), "only the capstone, has a reflection"),
        (_set(["first-lesson", "code"], "L02"), "is also used by"),
    ],
)
def test_each_check_fails_its_fixture(
    tmp_path: Path, mutate: Callable[[dict[str, dict[str, Any]]], None], expected: str
) -> None:
    found = problems(tmp_path, mutate)
    assert any(expected in problem for problem in found), found


def test_ordinary_words_that_are_also_symbol_names_only_count_as_code(tmp_path: Path) -> None:
    puzzle_word = {"id": "p-find-001", "answer": {"kind": "symbol", "id": "src/a.ts#request"}}

    def mutate(files: dict[str, dict[str, Any]]) -> None:
        files["first-lesson"]["teach"] = "Every request has a method."

    root = write_content(tmp_path, mutate)
    (root / "puzzles" / "repo" / "p-find-001.yaml").write_text(
        yaml.safe_dump(puzzle_word), encoding="utf-8"
    )
    assert validate_lessons(root, check_generated=False).problems == []
    lesson_path = root / "lessons" / "first-lesson.yaml"
    data = yaml.safe_load(lesson_path.read_text(encoding="utf-8"))
    data["teach"] = "Call `request` to begin."
    lesson_path.write_text(yaml.safe_dump(data), encoding="utf-8")
    assert any(
        "from p-find-001's answer" in problem
        for problem in validate_lessons(root, check_generated=False).problems
    )


def test_course_order_problems(tmp_path: Path) -> None:
    def unlisted(files: dict[str, dict[str, Any]]) -> None:
        files["course"]["groups"][0]["modules"][0]["lessons"] = ["the-capstone"]

    found = problems(tmp_path / "a", unlisted)
    assert any("isn't listed in course.yaml" in problem for problem in found), found

    def missing(files: dict[str, dict[str, Any]]) -> None:
        files["course"]["groups"][0]["modules"][0]["lessons"].append("ghost-lesson")

    found = problems(tmp_path / "b", missing)
    assert any("has no file" in problem for problem in found), found

    def no_capstone(files: dict[str, dict[str, Any]]) -> None:
        files["the-capstone"]["kind"] = "lesson"
        del files["the-capstone"]["reflection"]

    found = problems(tmp_path / "c", no_capstone)
    assert any("exactly one capstone" in problem for problem in found), found


def test_invalid_yaml_is_reported_against_its_file(tmp_path: Path) -> None:
    root = write_content(tmp_path)
    (root / "lessons" / "first-lesson.yaml").write_text("title: [unclosed\n", encoding="utf-8")
    found = validate_lessons(root, check_generated=False).problems
    assert any(problem.startswith("first-lesson.yaml: isn't valid YAML") for problem in found), (
        found
    )


def test_the_split_keeps_keys_out_of_the_public_file(tmp_path: Path) -> None:
    loaded = load_course(write_content(tmp_path), LessonReport())
    assert loaded is not None
    public, keys = render_generated(loaded)
    data = json.loads(
        public.split("export const COURSE: LearnCourse = ", 1)[1].rstrip().rstrip(";")
    )
    first = data["lessons"]["first-lesson"]
    assert data["order"] == ["first-lesson", "c1-check", "the-capstone"]
    assert first["requiredIds"] == ["exit"]
    assert first["exercises"][0]["hintCount"] == 1
    assert "key" not in first["exercises"][0]
    assert data["lessons"]["the-capstone"]["reflection"] == {"prompt": "Explain it."}
    for private in (
        'It is 1."',
        "Look at line 1.",
        "Not 2.",
        "One point for each part.",
        '"answer"',
    ):
        assert private not in public
    assert 'import "server-only";' in keys
    assert "Look at line 1." in keys and "One point for each part." in keys


def test_a_stale_generated_file_fails_validation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = write_content(tmp_path / "content")
    monkeypatch.setattr(lessons, "PUBLIC_OUT", tmp_path / "web" / "course.generated.ts")
    monkeypatch.setattr(lessons, "KEYS_OUT", tmp_path / "web" / "keys.generated.ts")
    monkeypatch.setattr(lessons, "REPO_ROOT", tmp_path)
    assert lessons.write_generated(root).ok
    assert validate_lessons(root).problems == []
    lesson_path = root / "lessons" / "first-lesson.yaml"
    data = yaml.safe_load(lesson_path.read_text(encoding="utf-8"))
    data["title"] = "A renamed lesson"
    lesson_path.write_text(yaml.safe_dump(data), encoding="utf-8")
    assert any("is out of date" in problem for problem in validate_lessons(root).problems)
