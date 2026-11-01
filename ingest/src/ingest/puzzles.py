"""Load content/puzzles/ into typed records.

A problem found here never quotes a value from the file, since any value might be part of a key.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, ClassVar, cast

import yaml
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from ingest import paths
from ingest.repos import Repo

CONTENT_DIR = paths.REPO_ROOT / "content"
SCHEMA_PATH = CONTENT_DIR / "schema" / "puzzle.schema.json"

# These rules' schema values come from the schema, so showing them can't show the instance.
_RULES_SHOWN_WITH_VALUE = frozenset(
    {"const", "enum", "maxItems", "minimum", "minItems", "pattern", "type", "uniqueItems"}
)
# jsonschema's messages for these quote property names only.
_RULES_SHOWN_WITH_MESSAGE = frozenset({"additionalProperties", "required"})


@dataclass(frozen=True)
class SymbolAnswer:
    kind: ClassVar[str] = "symbol"
    id: str
    accept: tuple[str, ...] = ()
    accept_reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class FileAnswer:
    kind: ClassVar[str] = "file"
    path: str
    accept: tuple[str, ...] = ()
    accept_reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class LocationAnswer:
    kind: ClassVar[str] = "location"
    path: str
    anchor: tuple[int, int]
    window: tuple[int, int]


@dataclass(frozen=True)
class SequenceAnswer:
    kind: ClassVar[str] = "sequence"
    ids: tuple[str, ...]
    accept_sequences: tuple[tuple[str, ...], ...] = ()
    accept_reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class SetAnswer:
    kind: ClassVar[str] = "set"
    ids: tuple[str, ...]


@dataclass(frozen=True)
class ChoiceAnswer:
    kind: ClassVar[str] = "choice"
    option: str


Answer = SymbolAnswer | FileAnswer | LocationAnswer | SequenceAnswer | SetAnswer | ChoiceAnswer


@dataclass(frozen=True)
class Choice:
    id: str
    label: str


@dataclass(frozen=True)
class Override:
    check: str
    reason: str


@dataclass(frozen=True)
class Puzzle:
    id: str
    snapshot: str
    type: str
    difficulty: str
    title: str
    prompt: str
    answer: Answer
    choices: tuple[Choice, ...] | None
    hints: tuple[str, ...]
    solution: str
    tags: tuple[str, ...]
    authors: tuple[str, ...]
    verified_by: tuple[str, ...]
    overrides: tuple[Override, ...]
    file: Path

    @property
    def snapshot_slug(self) -> str:
        return self.snapshot.partition("@")[0]

    @property
    def set_count(self) -> int | None:
        return len(self.answer.ids) if isinstance(self.answer, SetAnswer) else None

    @property
    def answer_block(self) -> dict[str, object]:
        """The answer as stored in answer_json, with omitted optional lists written out as []."""
        return {"kind": self.answer.kind, **asdict(self.answer)}


@dataclass(frozen=True)
class LoadFailure:
    file: Path
    # The file's id when it could be read, so duplicate IDs are still caught.
    puzzle_id: str | None
    check: str
    problems: tuple[str, ...]


def puzzle_files(content_dir: Path) -> list[Path]:
    """Every puzzle file. `.yml` is included so one can't dodge validation by its extension."""
    root = content_dir / "puzzles"
    return sorted(path for pattern in ("*.yaml", "*.yml") for path in root.rglob(pattern))


def puzzle_schema_validator() -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def load_puzzle(path: Path, validator: Draft202012Validator) -> Puzzle | LoadFailure:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        return LoadFailure(path, None, "yaml", ("the file is not valid UTF-8",))
    except yaml.MarkedYAMLError as error:
        mark = error.problem_mark
        where = f" at line {mark.line + 1}" if mark is not None else ""
        return LoadFailure(path, None, "yaml", (f"invalid YAML{where}",))
    except yaml.YAMLError:
        return LoadFailure(path, None, "yaml", ("invalid YAML",))

    if not isinstance(raw, dict):
        return LoadFailure(path, None, "schema", ("the file must contain a mapping",))
    document = cast(dict[str, Any], raw)
    found = validator.iter_errors(document)  # pyright: ignore[reportUnknownMemberType]
    errors = sorted(found, key=lambda error: error.json_path)
    if errors:
        puzzle_id = document.get("id")
        return LoadFailure(
            path,
            puzzle_id if isinstance(puzzle_id, str) else None,
            "schema",
            tuple(describe_schema_error(error) for error in errors),
        )
    return _build_puzzle(document, path)


def describe_schema_error(error: ValidationError) -> str:
    """Describe a schema failure without jsonschema's message, which quotes the instance."""
    rule = str(error.validator)
    if rule in _RULES_SHOWN_WITH_MESSAGE:
        return f"{error.json_path}: {error.message}"
    if rule in _RULES_SHOWN_WITH_VALUE:
        return f"{error.json_path}: must satisfy {rule} {error.validator_value!r}"
    return f"{error.json_path}: breaks the schema's '{rule}' rule"


def resolve_snapshot(snapshot: str, repos: list[Repo]) -> Repo | None:
    """Find the repo a puzzle's `<slug>@<sha or sha prefix>` names."""
    slug, _, prefix = snapshot.partition("@")
    return next((r for r in repos if r.slug == slug and r.sha.startswith(prefix)), None)


def _build_puzzle(document: dict[str, Any], path: Path) -> Puzzle:
    choices = document.get("choices")
    return Puzzle(
        id=document["id"],
        snapshot=document["snapshot"],
        type=document["type"],
        difficulty=document["difficulty"],
        title=document["title"],
        prompt=document["prompt"],
        answer=build_answer(document["answer"]),
        choices=None
        if choices is None
        else tuple(Choice(choice["id"], choice["label"]) for choice in choices),
        hints=tuple(document.get("hints", ())),
        solution=document["solution"],
        tags=tuple(document.get("tags", ())),
        authors=tuple(document["authors"]),
        verified_by=tuple(document["verified_by"]),
        overrides=tuple(
            Override(entry["check"], entry["reason"])
            for entry in document.get("validator_overrides", ())
        ),
        file=path,
    )


def build_answer(block: dict[str, Any]) -> Answer:
    accept = tuple[str, ...](block.get("accept", ()))
    reasons = tuple[str, ...](block.get("accept_reasons", ()))
    match block["kind"]:
        case "symbol":
            return SymbolAnswer(block["id"], accept, reasons)
        case "file":
            return FileAnswer(block["path"], accept, reasons)
        case "location":
            return LocationAnswer(
                block["path"], _line_range(block["anchor"]), _line_range(block["window"])
            )
        case "sequence":
            alternatives = tuple(tuple(sequence) for sequence in block.get("accept_sequences", ()))
            return SequenceAnswer(tuple(block["ids"]), alternatives, reasons)
        case "set":
            return SetAnswer(tuple(block["ids"]))
        case _:
            return ChoiceAnswer(block["option"])


def _line_range(values: list[int]) -> tuple[int, int]:
    return int(values[0]), int(values[1])
