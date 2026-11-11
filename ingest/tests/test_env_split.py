"""R2 write credentials must never appear in web/ (CLAUDE.md, Environment)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB = REPO_ROOT / "web"
SKIPPED_DIRS = frozenset({"node_modules", ".next", ".next-e2e", ".next-preview", ".next-smoke"})
TEXT_SUFFIXES = frozenset(
    {".example", ".js", ".cjs", ".mjs", ".jsx", ".json", ".ts", ".mts", ".cts", ".tsx"}
)


def _is_scanned(path: Path) -> bool:
    # .env and .env.local have no useful suffix, and they're where a copied credential would land.
    return path.suffix in TEXT_SUFFIXES or path.name == ".env" or path.name.startswith(".env.")


def _r2_offenders(root: Path) -> list[Path]:
    return [
        path
        for path in root.rglob("*")
        if path.is_file()
        and not SKIPPED_DIRS.intersection(path.relative_to(root).parts)
        and _is_scanned(path)
        and "R2_" in path.read_text(encoding="utf-8", errors="replace")
    ]


def _env_keys(path: Path) -> set[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return {line.split("=", 1)[0] for line in lines if line.strip() and not line.startswith("#")}


def test_no_r2_references_in_web() -> None:
    assert _r2_offenders(WEB) == []


def test_the_scan_reads_env_files(tmp_path: Path) -> None:
    for name in (".env", ".env.local", ".env.production.local"):
        (tmp_path / name).write_text("R2_SECRET_ACCESS_KEY=x\n", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("R2_ in prose isn't code\n", encoding="utf-8")
    found = {path.name for path in _r2_offenders(tmp_path)}
    assert found == {".env", ".env.local", ".env.production.local"}


def test_env_examples_match_the_split() -> None:
    assert _env_keys(WEB / ".env.example") == {
        "NEXT_PUBLIC_SNAPSHOT_CDN_URL",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "DATABASE_URL",
        "SNAPSHOT_DIR",
        "DEV_AUTH_TEST_HOST",
        "TEST_DATABASE_URL",
        "RESEND_API_KEY",
        "EMAIL_FROM",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASSWORD",
        "DEV_OUTBOX_DIR",
    }
    assert _env_keys(REPO_ROOT / "ingest" / ".env.example") == {
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "SUPABASE_DB_URL",
    }
