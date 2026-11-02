"""Run the SCIP indexer for a repo's language over a staged copy of the filtered files."""

import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from ingest.errors import IngestError
from ingest.fetch import remove_tree
from ingest.filter_config import NON_SOURCE_DIRS

SCIP_TYPESCRIPT_VERSION = "0.6.0"
SCIP_PYTHON_VERSION = "0.6.8"
TYPESCRIPT_LANGUAGES = frozenset({"javascript", "typescript"})
TYPESCRIPT_INSTALL_HELP = (
    "scip-typescript was not found on PATH. Install it with:\n"
    f"  npm install -g @sourcegraph/scip-typescript@{SCIP_TYPESCRIPT_VERSION}\n"
    "It needs Node 22 or newer. Open a new terminal afterward, then run this command again."
)
PYTHON_INSTALL_HELP = (
    "scip-python was not found on PATH. Install it with:\n"
    f"  npm install -g @sourcegraph/scip-python@{SCIP_PYTHON_VERSION}\n"
    "Open a new terminal afterward, then run this command again."
)

_INDEX_FILE = "index.scip"
_WINDOWS_EXECUTABLE_SUFFIXES = frozenset({".bat", ".cmd", ".com", ".exe", ".ps1"})
_NODE_HEAP = "--max-old-space-size=8192"
# Written beside each tsconfig.json, in the stage dir only, so never one of the snapshot's files.
_TSCONFIG = "tsconfig.scip.json"
_TSCONFIG_FALLBACK = "tsconfig.scip-fallback.json"
# A repo's own `include` and `references` tend to hide source, and they're built for emitting
# packages, which this never does. These configs keep its compiler options and paths, and widen the
# scope to every file below them. `bundler` resolution reads source the way a person does. A repo's
# Node16 setting rejects a `paths` entry pointing at a directory in an ES module, relying on
# node_modules links that a snapshot never installs, and every such import would go unresolved.
_TSCONFIG_OVERRIDES: Mapping[str, object] = {
    "allowJs": True,
    "composite": False,
    "declaration": False,
    "declarationMap": False,
    "incremental": False,
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": True,
    "skipLibCheck": True,
}
# tsconfig.json allows comments and trailing commas. The first alternative keeps strings intact, so
# a glob like "**/*" isn't mistaken for a comment.
_JSONC_NOISE = re.compile(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*.*?\*/', re.DOTALL)
_TRAILING_COMMA = re.compile(r",(\s*[}\]])")
_TSCONFIG_DEFAULTS: Mapping[str, object] = {
    "experimentalDecorators": True,
    "jsx": "preserve",
    "target": "esnext",
}
# scip-python reads this name before pyrightconfig.json or pyproject.toml, so it beats the repo's
# settings and any pyproject.toml in a parent directory, which pyright would otherwise walk up to.
_PYRIGHT_CONFIG_FILE = "scip-pyrightconfig.json"
# 3.12 is the newest scip-python's pyright accepts. Fixing the platform keeps the index the same on
# every machine: pyright treats `if sys.platform == ...` branches as unreachable, with no symbols.
_PYRIGHT_CONFIG: Mapping[str, object] = {
    "include": ["."],
    "pythonVersion": "3.12",
    "pythonPlatform": "Linux",
}
_PYTHON_ENVIRONMENT_FILE = "scip-environment.json"
_WINDOWS_SHIM = Path(__file__).with_name("scip_python_windows.cjs")


@dataclass(frozen=True)
class IndexResult:
    index_path: Path
    indexer_name: str
    indexer_version: str


def stage_files(checkout: Path, kept: Iterable[str], stage_dir: Path) -> None:
    """Copy kept files to a clean dir, so the indexer sees only what the snapshot contains.

    The exception is anything Windows could execute, since indexers run with this dir as their
    working directory. No indexer reads those files, and they stay in the snapshot's files/.
    """
    remove_tree(stage_dir)
    for rel_path in kept:
        if Path(rel_path).suffix.lower() in _WINDOWS_EXECUTABLE_SUFFIXES:
            continue
        destination = stage_dir / rel_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(checkout / rel_path, destination)


def run_indexer(language: str, stage_dir: Path) -> IndexResult:
    if language == "python":
        return _run_scip_python(stage_dir)
    if language in TYPESCRIPT_LANGUAGES:
        return _run_scip_typescript(stage_dir)
    raise IngestError(f"No SCIP indexer is set up for language '{language}' yet.")


def _run_scip_typescript(stage_dir: Path) -> IndexResult:
    executable = shutil.which("scip-typescript")
    if executable is None:
        raise IngestError(TYPESCRIPT_INSTALL_HELP)
    version = run_tool("scip-typescript", executable, "--version", cwd=stage_dir).strip()
    index_path = stage_dir / _INDEX_FILE
    run_tool(
        "scip-typescript",
        executable,
        "index",
        *write_typescript_projects(stage_dir),
        "--cwd",
        str(stage_dir),
        "--output",
        _INDEX_FILE,
        "--no-progress-bar",
        cwd=stage_dir,
        env={"NODE_OPTIONS": _NODE_HEAP},
    )
    if not index_path.is_file():
        raise IngestError(f"scip-typescript exited cleanly but wrote no file at {index_path}.")
    return IndexResult(index_path, "scip-typescript", version)


def write_typescript_projects(stage_dir: Path) -> list[str]:
    """Write the configs to index, and return them in order, relative to the stage dir.

    scip-typescript indexes a file only in the first project holding it. Going deepest first means
    each file gets its nearest tsconfig.json, whose `paths` its imports depend on. The last project
    has no repo config in it, so it picks up whatever's left: files under no tsconfig.json, and
    those under one scip-typescript rejects, because it extends a package that isn't installed or
    uses an option this TypeScript doesn't know. It skips a rejected project and carries on.
    """
    # It looks for a package.json up to the filesystem root. Stop it leaving the stage dir.
    package_json = stage_dir / "package.json"
    if not package_json.exists():
        _write_json(package_json, {"name": "snapshot", "version": "0"})

    # `files` and `exclude` are inherited unless they're replaced. Only a config that extends
    # another may have an empty `files`.
    scope = {"include": ["**/*"], "exclude": ["**/node_modules"]}
    projects: list[str] = []
    for directory in _typescript_project_dirs(stage_dir):
        _write_json(
            directory / _TSCONFIG,
            {
                "extends": "./tsconfig.json",
                "compilerOptions": _TSCONFIG_OVERRIDES,
                "files": [],
                **scope,
            },
        )
        projects.append((directory / _TSCONFIG).relative_to(stage_dir).as_posix())
    _write_json(
        stage_dir / _TSCONFIG_FALLBACK,
        {"compilerOptions": {**_TSCONFIG_DEFAULTS, **_TSCONFIG_OVERRIDES}, **scope},
    )
    return [*projects, _TSCONFIG_FALLBACK]


def _typescript_project_dirs(stage_dir: Path) -> list[Path]:
    # Examples and test fixtures can have dozens of these, and don't need their own settings.
    directories = [
        config.parent
        for config in stage_dir.rglob("tsconfig.json")
        if not NON_SOURCE_DIRS.intersection(config.relative_to(stage_dir).parts[:-1])
        and not _only_points_to_references(config)
    ]
    return sorted(directories, key=lambda directory: (-len(directory.parts), directory))


def _only_points_to_references(tsconfig: Path) -> bool:
    """Whether this is a solution-style config, with `references` but no files of its own.

    Nothing builds with its options, and adopting them would hide the `paths` of a config further
    up: nestjs/nest's packages import each other through paths only its root config defines.
    """
    text = tsconfig.read_text(encoding="utf-8", errors="replace")
    without_comments = _JSONC_NOISE.sub(lambda match: match.group(1) or "", text)
    try:
        parsed: object = json.loads(_TRAILING_COMMA.sub(r"\1", without_comments))
    except json.JSONDecodeError:
        return False  # Let scip-typescript report it. The catch-all still covers its files.
    if not isinstance(parsed, dict):
        return False
    config = cast(dict[str, object], parsed)
    return (
        bool(config.get("references")) and config.get("files") == [] and not config.get("include")
    )


def _run_scip_python(stage_dir: Path) -> IndexResult:
    executable = shutil.which("scip-python")
    if executable is None:
        raise IngestError(PYTHON_INSTALL_HELP)
    node_options = [_NODE_HEAP]
    if sys.platform == "win32":
        # Forward slashes, because NODE_OPTIONS treats a backslash in quotes as an escape.
        node_options.append(f'--require "{_WINDOWS_SHIM.as_posix()}"')
    env = {"NODE_OPTIONS": " ".join(node_options)}
    version = run_tool("scip-python", executable, "--version", cwd=stage_dir, env=env).strip()

    _write_json(
        stage_dir / _PYRIGHT_CONFIG_FILE,
        {**_PYRIGHT_CONFIG, "extraPaths": python_source_roots(stage_dir)},
    )
    # An empty environment stops it asking pip about whatever this machine has installed.
    environment = stage_dir / _PYTHON_ENVIRONMENT_FILE
    _write_json(environment, [])
    index_path = stage_dir / _INDEX_FILE
    run_tool(
        "scip-python",
        executable,
        "index",
        # It drops any file whose path doesn't start with this exact string, so on Windows this
        # must be the native spelling. A forward-slash path gives an empty index and no error.
        "--cwd",
        str(stage_dir.resolve()),
        "--project-name",
        "snapshot",
        "--project-version",
        "0",
        "--environment",
        str(environment.resolve()),
        "--output",
        _INDEX_FILE,
        "--quiet",
        cwd=stage_dir,
        env=env,
    )
    if not index_path.is_file():
        raise IngestError(f"scip-python exited cleanly but wrote no file at {index_path}.")
    return IndexResult(index_path, "scip-python", version)


def python_source_roots(stage_dir: Path) -> list[str]:
    """Return src-layout roots, relative to the stage dir.

    Without these, pyright names a file's module from the repo root, `src.flask.app`, but an
    absolute import names it `flask.app`. The two symbols never match, so every cross-file reference
    written that way is silently lost. A `src` holding `__init__.py` is itself a package, and code
    really does import it as `src.x`.
    """
    candidates = [*stage_dir.glob("src"), *stage_dir.glob("*/src"), *stage_dir.glob("*/*/src")]
    return sorted(
        path.relative_to(stage_dir).as_posix()
        for path in candidates
        if path.is_dir() and not (path / "__init__.py").exists() and any(path.rglob("*.py"))
    )


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def run_tool(
    tool: str, executable: str, *args: str, cwd: Path, env: Mapping[str, str] | None = None
) -> str:
    result = subprocess.run(
        [executable, *args],
        cwd=cwd,
        # The npm .cmd shims run a bare `node`, and cmd.exe would look for it in the current
        # directory first: the stage dir, which holds untrusted repo files.
        env={**os.environ, "NoDefaultCurrentDirectoryInExePath": "1", **(env or {})},
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        raise IngestError(f"{tool} {' '.join(args)} failed:\n{details}")
    return result.stdout
