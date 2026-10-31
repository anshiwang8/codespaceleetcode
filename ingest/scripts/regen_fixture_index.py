"""Rebuild tests/fixtures/tiny-repo.scip with the real indexer. Needs scip-typescript on PATH.

Run from ingest/: uv run python scripts/regen_fixture_index.py
"""

import shutil
import tempfile
from pathlib import Path

from ingest.indexer import run_indexer, stage_files
from ingest.paths import INGEST_ROOT
from ingest.proto import scip_pb2

FIXTURES = INGEST_ROOT / "tests" / "fixtures"
TINY_REPO = FIXTURES / "tiny-repo"
OUTPUT = FIXTURES / "tiny-repo.scip"


def main() -> None:
    kept = [
        path.relative_to(TINY_REPO).as_posix() for path in TINY_REPO.rglob("*") if path.is_file()
    ]
    with tempfile.TemporaryDirectory() as temp:
        stage = Path(temp) / "stage"
        stage_files(TINY_REPO, kept, stage)
        result = run_indexer("javascript", stage)
        index = scip_pb2.Index()
        index.ParseFromString(result.index_path.read_bytes())
    # These hold absolute paths from the machine that ran the indexer.
    index.metadata.project_root = ""
    del index.metadata.tool_info.arguments[:]
    for document in index.documents:
        for info in document.symbols:
            del info.documentation[:]
            info.ClearField("signature_documentation")
    OUTPUT.write_bytes(index.SerializeToString(deterministic=True))
    print(f"Wrote {OUTPUT} using scip-typescript {result.indexer_version}")
    shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    main()
