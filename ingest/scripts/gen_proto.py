"""Regenerate scip_pb2.py and scip_pb2.pyi from the vendored scip.proto.

scip.proto comes from github.com/scip-code/scip (Apache-2.0) at commit
bbec5345bfae602b31286a9ec74e2c2042713f50. PyPI's `scip` is an unrelated package: don't install it.

Run from ingest/: uv run python scripts/gen_proto.py
"""

import subprocess
import sys

from ingest.paths import INGEST_ROOT

PROTO_DIR = INGEST_ROOT / "src" / "ingest" / "proto"


def main() -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "grpc_tools.protoc",
            f"-I{PROTO_DIR}",
            f"--python_out={PROTO_DIR}",
            f"--pyi_out={PROTO_DIR}",
            "scip.proto",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
