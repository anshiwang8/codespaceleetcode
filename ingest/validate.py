"""The entry point spec section 6 names. The checks live in ingest.validate."""

from ingest.cli import app

if __name__ == "__main__":
    app(["validate"])
