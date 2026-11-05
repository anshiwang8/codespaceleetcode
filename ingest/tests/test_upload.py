"""Snapshot upload to R2 (launch checklist C2), against a fake store and a stubbed S3 client."""

import hashlib
import threading
from pathlib import Path

import boto3
import pytest
from botocore.stub import ANY, Stubber
from typer.testing import CliRunner

from ingest.cli import app
from ingest.errors import IngestError
from ingest.upload import (
    CACHE_CONTROL,
    FILE_CONTENT_TYPE,
    MANIFEST_CONTENT_TYPE,
    R2_ENV,
    S3ObjectStore,
    plan_items,
    r2_store_from_env,
    upload_snapshot,
)

NAME = "acme-tiny@" + "a" * 40
PREFIX = f"snapshots/{NAME}/"


class FakeStore:
    def __init__(self, existing: dict[str, bytes] | None = None, fail_on: str | None = None):
        self.objects: dict[str, tuple[bytes, str]] = {
            key: (body, "") for key, body in (existing or {}).items()
        }
        self.order: list[str] = []
        self.fail_on = fail_on
        self._lock = threading.Lock()

    def list_etags(self, prefix: str) -> dict[str, str]:
        return {
            key: hashlib.md5(body).hexdigest()
            for key, (body, _) in self.objects.items()
            if key.startswith(prefix)
        }

    def put(self, key: str, body: bytes, content_type: str) -> None:
        if self.fail_on and key.endswith(self.fail_on):
            raise OSError("network down")
        with self._lock:
            self.objects[key] = (body, content_type)
            self.order.append(key)


def _snapshot(tmp_path: Path) -> Path:
    directory = tmp_path / NAME
    (directory / "files" / "src" / "deep dir").mkdir(parents=True)
    (directory / "manifest.json").write_bytes(b'{"files": []}')
    # Bytes, not text: on Windows write_text would turn \n into \r\n.
    (directory / "files" / "src" / "index.ts").write_bytes(b"export {};\n")
    (directory / "files" / "src" / "deep dir" / "a#b.ts").write_bytes(b"x\n")
    (directory / "files" / "logo.png").write_bytes(b"\x89PNG\x00\x01")
    # The database's files, which must never reach the bucket.
    for name in ("symbols.jsonl", "occurrences.jsonl", "call_edges.jsonl", "summary.json"):
        (directory / name).write_text("{}\n", encoding="utf-8")
    return directory


def test_uploads_only_the_manifest_and_files_at_the_paths_the_browser_fetches(
    tmp_path: Path,
) -> None:
    store = FakeStore()
    counts = upload_snapshot(store, _snapshot(tmp_path), NAME, lambda _: None)
    assert sorted(store.objects) == [
        f"{PREFIX}files/logo.png",
        f"{PREFIX}files/src/deep dir/a#b.ts",
        f"{PREFIX}files/src/index.ts",
        f"{PREFIX}manifest.json",
    ]
    assert counts.uploaded == 4
    assert counts.skipped == 0


def test_sets_content_types_like_the_local_route(tmp_path: Path) -> None:
    store = FakeStore()
    upload_snapshot(store, _snapshot(tmp_path), NAME, lambda _: None)
    assert store.objects[f"{PREFIX}manifest.json"][1] == MANIFEST_CONTENT_TYPE
    assert store.objects[f"{PREFIX}files/src/index.ts"][1] == FILE_CONTENT_TYPE
    assert store.objects[f"{PREFIX}files/logo.png"][1] == FILE_CONTENT_TYPE


def test_the_manifest_goes_last(tmp_path: Path) -> None:
    store = FakeStore()
    upload_snapshot(store, _snapshot(tmp_path), NAME, lambda _: None, workers=4)
    assert store.order[-1] == f"{PREFIX}manifest.json"


def test_a_failed_file_stops_the_manifest(tmp_path: Path) -> None:
    store = FakeStore(fail_on="index.ts")
    with pytest.raises(OSError, match="network down"):
        upload_snapshot(store, _snapshot(tmp_path), NAME, lambda _: None)
    assert f"{PREFIX}manifest.json" not in store.objects


def test_skips_files_already_there_with_the_same_content(tmp_path: Path) -> None:
    directory = _snapshot(tmp_path)
    store = FakeStore(
        {
            f"{PREFIX}files/src/index.ts": b"export {};\n",
            f"{PREFIX}files/logo.png": b"stale",
        }
    )
    counts = upload_snapshot(store, directory, NAME, lambda _: None)
    assert counts.skipped == 1
    assert counts.uploaded == 3
    assert f"{PREFIX}files/src/index.ts" not in store.order
    assert store.objects[f"{PREFIX}files/logo.png"][0] == b"\x89PNG\x00\x01"

    again = upload_snapshot(store, directory, NAME, lambda _: None)
    assert (again.uploaded, again.skipped) == (0, 4)


def test_never_deletes(tmp_path: Path) -> None:
    store = FakeStore({f"{PREFIX}files/removed.ts": b"old", "snapshots/other@x/manifest.json": b""})
    upload_snapshot(store, _snapshot(tmp_path), NAME, lambda _: None)
    assert f"{PREFIX}files/removed.ts" in store.objects
    assert "snapshots/other@x/manifest.json" in store.objects


def test_dry_run_uploads_nothing(tmp_path: Path) -> None:
    store = FakeStore()
    lines: list[str] = []
    counts = upload_snapshot(store, _snapshot(tmp_path), NAME, lines.append, dry_run=True)
    assert store.objects == {}
    assert counts.uploaded == 4
    assert "would upload 4 files" in lines[0]


def test_refuses_a_snapshot_that_isnt_built(tmp_path: Path) -> None:
    with pytest.raises(IngestError, match=r"no manifest.json"):
        plan_items(tmp_path / NAME, NAME)


def test_refuses_symlinks(tmp_path: Path) -> None:
    directory = _snapshot(tmp_path)
    secret = tmp_path / "secret.txt"
    secret.write_text("not for the bucket", encoding="utf-8")
    try:
        (directory / "files" / "link.ts").symlink_to(secret)
    except OSError:
        pytest.skip("This system can't make symlinks without extra rights.")
    with pytest.raises(IngestError, match="symlink"):
        plan_items(directory, NAME)


# The real S3 adapter, with botocore's Stubber standing in for R2.


def _stubbed() -> tuple[S3ObjectStore, Stubber]:
    client = boto3.client(  # pyright: ignore[reportUnknownMemberType]
        "s3",
        endpoint_url="https://example.r2.cloudflarestorage.com",
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="auto",
    )
    return S3ObjectStore(client, "bucket"), Stubber(client)


def test_s3_store_lists_every_page_and_normalizes_etags() -> None:
    store, stubber = _stubbed()
    stubber.add_response(
        "list_objects_v2",
        {
            "Contents": [{"Key": f"{PREFIX}manifest.json", "ETag": '"ABC123"'}],
            "IsTruncated": True,
            "NextContinuationToken": "next",
        },
        {"Bucket": "bucket", "Prefix": PREFIX},
    )
    stubber.add_response(
        "list_objects_v2",
        {"Contents": [{"Key": f"{PREFIX}files/a.ts", "ETag": '"def"'}], "IsTruncated": False},
        {"Bucket": "bucket", "Prefix": PREFIX, "ContinuationToken": "next"},
    )
    with stubber:
        assert store.list_etags(PREFIX) == {
            f"{PREFIX}manifest.json": "abc123",
            f"{PREFIX}files/a.ts": "def",
        }
    stubber.assert_no_pending_responses()


def test_s3_store_puts_with_type_cache_control_and_md5() -> None:
    store, stubber = _stubbed()
    stubber.add_response(
        "put_object",
        {},
        {
            "Bucket": "bucket",
            "Key": f"{PREFIX}manifest.json",
            "Body": b"{}",
            "ContentType": MANIFEST_CONTENT_TYPE,
            "CacheControl": CACHE_CONTROL,
            "ContentMD5": ANY,
        },
    )
    with stubber:
        store.put(f"{PREFIX}manifest.json", b"{}", MANIFEST_CONTENT_TYPE)
    stubber.assert_no_pending_responses()


def test_r2_config_names_missing_variables_without_values() -> None:
    with pytest.raises(IngestError) as caught:
        r2_store_from_env({"R2_ACCOUNT_ID": "0" * 32, "R2_SECRET_ACCESS_KEY": "hunter2"})
    message = str(caught.value)
    assert "R2_ACCESS_KEY_ID" in message
    assert "R2_BUCKET" in message
    assert "hunter2" not in message


def test_r2_config_checks_account_and_bucket() -> None:
    env = {name: "x" for name in R2_ENV}
    with pytest.raises(IngestError, match="R2_ACCOUNT_ID"):
        r2_store_from_env({**env, "R2_ACCOUNT_ID": "evil.com/x", "R2_BUCKET": "snapshots"})
    with pytest.raises(IngestError, match="R2_BUCKET"):
        r2_store_from_env({**env, "R2_ACCOUNT_ID": "0" * 32, "R2_BUCKET": "Bad_Name"})
    store = r2_store_from_env({**env, "R2_ACCOUNT_ID": "0" * 32, "R2_BUCKET": "snapshots"})
    assert isinstance(store, S3ObjectStore)


def test_cli_upload_refuses_without_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in R2_ENV:
        monkeypatch.delenv(name, raising=False)
    result = CliRunner().invoke(app, ["upload-all", "--dry-run"])
    assert result.exit_code == 1
    assert "R2_ACCOUNT_ID" in result.output
