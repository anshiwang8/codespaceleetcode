import { z } from "zod";
import { FilterBar } from "@/components/list/FilterBar";
import { PuzzleTable } from "@/components/list/PuzzleTable";
import styles from "@/components/list/list.module.css";
import { getCurrentUser } from "@/lib/server/auth";
import { textValue } from "@/lib/server/http";
import { listPuzzles, type PuzzleFilters } from "@/lib/server/puzzles";

const textFilter = textValue(200);

// A bad or repeated value in the URL is ignored rather than failing the whole page.
function parseFilters(params: Record<string, string | string[] | undefined>): PuzzleFilters {
  const type = z.enum(["find", "trace", "architecture"]).safeParse(params.type);
  const difficulty = z.enum(["easy", "medium", "hard"]).safeParse(params.difficulty);
  const repo = textFilter.safeParse(params.repo);
  const tag = textFilter.safeParse(params.tag);
  return {
    ...(type.success ? { type: type.data } : {}),
    ...(difficulty.success ? { difficulty: difficulty.data } : {}),
    ...(repo.success ? { repo: repo.data } : {}),
    ...(tag.success ? { tag: tag.data } : {}),
  };
}

export default async function PuzzleListPage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const user = await getCurrentUser();
  const { puzzles, repos, tags } = await listPuzzles(user?.id ?? null, filters);

  // `repos` ignores the filters, so empty means nothing is published at all.
  if (repos.length === 0) {
    return (
      <main className="page-message" data-testid="no-puzzles-seeded">
        <h1>No puzzles seeded yet</h1>
        <p className="muted">The database is running, but it has no published puzzles.</p>
        <p className="muted">
          From <code>ingest/</code>, run <code>uv run python -m ingest seed</code>, then reload this page.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Puzzles</h1>
        <p className="muted">
          {puzzles.length} {puzzles.length === 1 ? "puzzle" : "puzzles"}
        </p>
      </div>
      <FilterBar filters={filters} repos={repos} tags={tags} />
      {puzzles.length === 0 ? (
        <p className="notice" data-testid="no-matches">
          No puzzles match these filters.
        </p>
      ) : (
        <PuzzleTable puzzles={puzzles} />
      )}
    </main>
  );
}
