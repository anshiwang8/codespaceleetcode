"""Upload a snapshot's client files to R2 (launch checklist C2).

The browser fetches `snapshots/<slug>@<sha>/manifest.json` and `.../files/<path>` from
NEXT_PUBLIC_SNAPSHOT_CDN_URL, the same paths the localhost `/snapshots` route serves. Only those
go up: symbols, occurrences and edges are for the database, not for clients.

Files go first and the manifest last, so a manifest never points at files that aren't there yet.
A file already in the bucket with the same MD5 (R2's ETag for a single-part upload) is skipped.
Nothing is ever deleted: a snapshot's SHA never changes, and an old manifest may still be cached.
"""

import hashlib
import os
import re
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from ingest.errors import IngestError

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

MANIFEST_CONTENT_TYPE = "application/json; charset=utf-8"
# The viewer treats every file as text and decides for itself what's binary, like the local route.
FILE_CONTENT_TYPE = "text/plain; charset=utf-8"
# A rebuilt snapshot keeps its name but can change its files, so caches must revalidate. The ETag
# makes that a cheap 304. This matches web/app/snapshots/[name]/[...path]/route.ts.
CACHE_CONTROL = "public, no-cache"
R2_ENV = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
_ACCOUNT_ID = re.compile(r"^[0-9a-f]{32}$")
_BUCKET = re.compile(r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")
_WORKERS = 16


class ObjectStore(Protocol):
    def list_etags(self, prefix: str) -> dict[str, str]:
        """Every key under the prefix, with its ETag lowercased and without quotes."""
        ...

    def put(self, key: str, body: bytes, content_type: str) -> None: ...


@dataclass(frozen=True)
class UploadItem:
    key: str
    path: Path
    content_type: str
    md5: str


@dataclass
class UploadCounts:
    uploaded: int = 0
    skipped: int = 0
    bytes: int = 0


def snapshot_prefix(name: str) -> str:
    return f"snapshots/{name}/"


def plan_items(snapshot_dir: Path, name: str) -> list[UploadItem]:
    """Every file under files/, sorted, then manifest.json."""
    manifest = snapshot_dir / "manifest.json"
    files_dir = snapshot_dir / "files"
    if not manifest.is_file() or not files_dir.is_dir():
        raise IngestError(
            f"{snapshot_dir} has no manifest.json and files/. Build it first with "
            "`python -m ingest snapshot`."
        )
    prefix = snapshot_prefix(name)
    items = [
        _item(f"{prefix}files/{path.relative_to(files_dir).as_posix()}", path, FILE_CONTENT_TYPE)
        for path in _walk(files_dir)
    ]
    items.append(_item(f"{prefix}manifest.json", manifest, MANIFEST_CONTENT_TYPE))
    return items


def upload_snapshot(
    store: ObjectStore,
    snapshot_dir: Path,
    name: str,
    echo: Callable[[str], None],
    *,
    dry_run: bool = False,
    workers: int = _WORKERS,
) -> UploadCounts:
    items = plan_items(snapshot_dir, name)
    existing = store.list_etags(snapshot_prefix(name))
    pending = [item for item in items if existing.get(item.key) != item.md5]
    counts = UploadCounts(skipped=len(items) - len(pending))
    if dry_run:
        counts.uploaded = len(pending)
        counts.bytes = sum(item.path.stat().st_size for item in pending)
        echo(f"{name}: would upload {len(pending)} files, {counts.skipped} already there.")
        return counts

    files = [item for item in pending if not item.key.endswith("/manifest.json")]
    manifests = [item for item in pending if item.key.endswith("/manifest.json")]

    def send(item: UploadItem) -> int:
        body = item.path.read_bytes()
        store.put(item.key, body, item.content_type)
        return len(body)

    # Every file must be there before the manifest that lists them. If any upload fails, the
    # executor re-raises it here and the manifest isn't sent.
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for size in pool.map(send, files):
            counts.uploaded += 1
            counts.bytes += size
    for item in manifests:
        counts.bytes += send(item)
        counts.uploaded += 1
    echo(
        f"{name}: uploaded {counts.uploaded} files ({counts.bytes / 1_000_000:.1f} MB), "
        f"{counts.skipped} already there."
    )
    return counts


class S3ObjectStore:
    """R2 through its S3 API."""

    def __init__(self, client: "S3Client", bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def list_etags(self, prefix: str) -> dict[str, str]:
        etags: dict[str, str] = {}
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for entry in page.get("Contents", []):
                key = entry.get("Key")
                etag = entry.get("ETag")
                if key is not None and etag is not None:
                    etags[key] = etag.strip('"').lower()
        return etags

    def put(self, key: str, body: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            CacheControl=CACHE_CONTROL,
            ContentMD5=_base64_md5(body),
        )


def r2_store_from_env(environ: dict[str, str] | None = None) -> S3ObjectStore:
    """The bucket from R2_* in the environment. Messages name variables, never their values."""
    env = dict(os.environ) if environ is None else environ
    missing = [name for name in R2_ENV if not env.get(name, "").strip()]
    if missing:
        raise IngestError(
            f"{', '.join(missing)} not set. Put them in ingest/.env and run with "
            "`uv run --env-file .env python -m ingest upload ...`."
        )
    account = env["R2_ACCOUNT_ID"].strip()
    bucket = env["R2_BUCKET"].strip()
    if not _ACCOUNT_ID.match(account):
        raise IngestError("R2_ACCOUNT_ID should be the 32-character hex account ID.")
    if not _BUCKET.match(bucket):
        raise IngestError("R2_BUCKET isn't a valid bucket name.")

    import boto3
    from botocore.config import Config

    client: S3Client = boto3.client(  # pyright: ignore[reportUnknownMemberType]
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"].strip(),
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"].strip(),
        region_name="auto",
        config=Config(
            retries={"max_attempts": 5, "mode": "standard"},
            max_pool_connections=_WORKERS,
            # R2 checks Content-MD5; it doesn't need boto3's newer default CRC checksums.
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )
    return S3ObjectStore(client, bucket)


def describe_upload_error(error: Exception) -> str:
    """A boto error, by its code only, since full messages can include request details."""
    from botocore.exceptions import BotoCoreError, ClientError

    if isinstance(error, ClientError):
        code = error.response.get("Error", {}).get("Code", "unknown")
        return f"R2 refused the request ({code}). Check the bucket name and the token's access."
    if isinstance(error, BotoCoreError):
        return f"Couldn't reach R2 ({type(error).__name__})."
    raise error


def _walk(directory: Path) -> Iterator[Path]:
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise IngestError(f"{path} is a symlink; a snapshot's files must be real files.")
        if path.is_file():
            yield path


def _item(key: str, path: Path, content_type: str) -> UploadItem:
    return UploadItem(
        key, path, content_type, hashlib.md5(path.read_bytes(), usedforsecurity=False).hexdigest()
    )


def _base64_md5(body: bytes) -> str:
    import base64

    return base64.b64encode(hashlib.md5(body, usedforsecurity=False).digest()).decode("ascii")
