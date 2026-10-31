"""R2 write credentials must never appear in web/ (CLAUDE.md, Environment)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB = REPO_ROOT / "web"
SKIPPED_DIRS = frozenset({"node_modules", ".next"})
TEXT_SUFFIXES = frozenset({".example", ".js", ".json", ".mjs", ".ts", ".tsx"})


def _env_keys(path: Path) -> set[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return {line.split("=", 1)[0] for line in lines if line.strip()}


def test_no_r2_references_in_web() -> None:
    offenders = [
        path
        for path in WEB.rglob("*")
        if path.is_file()
        and not SKIPPED_DIRS.intersection(path.relative_to(WEB).parts)
        and path.suffix in TEXT_SUFFIXES
        and "R2_" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []


def test_env_examples_match_the_split() -> None:
    assert _env_keys(WEB / ".env.example") == {
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "NEXT_PUBLIC_SNAPSHOT_CDN_URL",
    }
    assert _env_keys(REPO_ROOT / "ingest" / ".env.example") == {
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "SUPABASE_DB_URL",
    }
