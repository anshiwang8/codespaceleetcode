"""Apply filter_config's rules to a checked-out repo."""

import os
from collections import Counter
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path, PurePosixPath

from ingest import filter_config as rules


class SkipReason(StrEnum):
    VENDORED_DIR = "vendored_dir"
    SYMLINK = "symlink"
    TOO_LARGE = "too_large"
    BINARY = "binary"
    GENERATED = "generated"
    MINIFIED = "minified"


@dataclass
class FilterResult:
    kept: list[str] = field(default_factory=list[str])
    skipped: dict[str, SkipReason] = field(default_factory=dict[str, SkipReason])

    def skipped_by_reason(self) -> Counter[str]:
        return Counter(str(reason) for reason in self.skipped.values())


def filter_tree(root: Path) -> FilterResult:
    """Classify every file under root. Paths are repo-relative with forward slashes, sorted."""
    result = FilterResult()
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = [name for name in dirnames if name not in rules.IGNORED_DIRS]
        for name in dirnames:
            if (Path(dirpath) / name).is_symlink():
                rel_path = (Path(dirpath) / name).relative_to(root).as_posix()
                result.skipped[rel_path] = SkipReason.SYMLINK
        for name in filenames:
            path = Path(dirpath) / name
            rel_path = path.relative_to(root).as_posix()
            reason = classify_file(path, rel_path)
            if reason is None:
                result.kept.append(rel_path)
            else:
                result.skipped[rel_path] = reason
    result.kept.sort()
    return result


def classify_file(path: Path, rel_path: str) -> SkipReason | None:
    """Return why a file is dropped, or None to keep it."""
    # A symlink could point outside the repo, so its target must never be read or copied.
    if path.is_symlink():
        return SkipReason.SYMLINK
    pure = PurePosixPath(rel_path)
    if any(part in rules.VENDORED_DIRS for part in pure.parts[:-1]):
        return SkipReason.VENDORED_DIR
    if rules.LICENSE_NAME_RE.match(pure.name):
        return None
    if path.stat().st_size > rules.MAX_FILE_BYTES:
        return SkipReason.TOO_LARGE
    if pure.suffix.lower() in rules.BINARY_EXTENSIONS:
        return SkipReason.BINARY
    data = path.read_bytes()
    if b"\0" in data[: rules.BINARY_SNIFF_BYTES]:
        return SkipReason.BINARY
    if _is_generated(pure, data):
        return SkipReason.GENERATED
    if _is_minified(pure, data):
        return SkipReason.MINIFIED
    return None


def detect_language(rel_path: str) -> str:
    return rules.LANGUAGE_BY_EXTENSION.get(PurePosixPath(rel_path).suffix.lower(), "other")


def _is_generated(pure: PurePosixPath, data: bytes) -> bool:
    if pure.name in rules.GENERATED_FILENAMES or rules.GENERATED_NAME_RE.search(pure.name):
        return True
    header_lines = data.split(b"\n", rules.GENERATED_HEADER_LINES)[: rules.GENERATED_HEADER_LINES]
    header = b"\n".join(header_lines)
    return any(marker.encode() in header for marker in rules.GENERATED_HEADER_MARKERS)


def _is_minified(pure: PurePosixPath, data: bytes) -> bool:
    if rules.MINIFIED_NAME_RE.search(pure.name):
        return True
    if pure.suffix.lower() not in rules.MINIFIED_CHECK_EXTENSIONS or not data:
        return False
    return len(data) / (data.count(b"\n") + 1) > rules.MINIFIED_AVG_LINE_LENGTH
