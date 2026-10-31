"""Rebuild the committed fixture indexes with the real indexers. Needs both on PATH.

Run from ingest/: uv run python scripts/regen_fixture_index.py
"""

import shutil
import tempfile
from pathlib import Path

from ingest.indexer import run_indexer, stage_files
from ingest.paths import INGEST_ROOT
from ingest.proto import scip_pb2

FIXTURES = INGEST_ROOT / "tests" / "fixtures"
REPOS = {"tiny-repo": "javascript", "tiny-typescript": "typescript", "tiny-python": "python"}


def _strip_machine_details(index: scip_pb2.Index) -> None:
    # These hold absolute paths from the machine that ran the indexer. scip-python's documentation
    # quotes the file paths of the standard library stubs it found.
    index.metadata.project_root = ""
    del index.metadata.tool_info.arguments[:]
    infos = [info for document in index.documents for info in document.symbols]
    for info in [*infos, *index.external_symbols]:
        del info.documentation[:]
        info.ClearField("signature_documentation")


def main() -> None:
    for name, language in REPOS.items():
        repo = FIXTURES / name
        kept = [
            path.relative_to(repo).as_posix()
            for path in repo.rglob("*")
            if path.is_file() and "__pycache__" not in path.parts
        ]
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / "stage"
            stage_files(repo, kept, stage)
            result = run_indexer(language, stage)
            index = scip_pb2.Index()
            index.ParseFromString(result.index_path.read_bytes())
            shutil.rmtree(stage, ignore_errors=True)
        _strip_machine_details(index)
        output = FIXTURES / f"{name}.scip"
        output.write_bytes(index.SerializeToString(deterministic=True))
        print(f"Wrote {output} using {result.indexer_name} {result.indexer_version}")


if __name__ == "__main__":
    main()
