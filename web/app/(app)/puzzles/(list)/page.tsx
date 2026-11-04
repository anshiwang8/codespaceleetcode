import type { Metadata } from "next";
import { z } from "zod";
import { DifficultyStrip } from "@/components/list/DifficultyStrip";
import { FilterBar } from "@/components/list/FilterBar";
import { GroupBy } from "@/components/list/GroupBy";
import { PuzzleGroupSection } from "@/components/list/PuzzleGroupSection";
import { PuzzleTable } from "@/components/list/PuzzleTable";
import styles from "@/components/list/list.module.css";
import {
  DEFAULT_GROUPING,
  difficultyTallies,
  filterPuzzles,
  groupPuzzles,
  GROUPINGS,
  parseSort,
  sortPuzzles,
  type BrowseFilters,
  type BrowseState,
  type Grouping,
} from "@/lib/browse";
import { getCurrentUser } from "@/lib/server/auth";
import { textValue } from "@/lib/server/http";
import { listPuzzles } from "@/lib/server/puzzles";

const textFilter = textValue(200);

// A bad or repeated value in the URL is ignored rather than failing the whole page.
function parseFilters(params: Record<string, string | string[] | undefined>): BrowseFilters {
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

function parseGrouping(value: string | string[] | undefined): Grouping {
  const parsed = z.enum(GROUPINGS).safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GROUPING;
}

export const metadata: Metadata = { title: "Puzzles" };

export default async function PuzzleListPage({ searchParams }: PageProps<"/puzzles">) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const state: BrowseState = {
    filters: parseFilters(params),
    group: parseGrouping(params.group),
    ...(sort ? { sort } : {}),
  };
  const user = await getCurrentUser();
  // Every published puzzle, filtered here, so each control can count what it would show.
  const { puzzles: all, repos, tags } = await listPuzzles(user?.id ?? null, {});

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

  // Sorted before grouping, so every section keeps the chosen order.
  const shown = sortPuzzles(filterPuzzles(all, state.filters), state.sort);
  const groups = groupPuzzles(shown, state.group, state.filters);
  const showProgress = user !== null;
  const solved = shown.filter((puzzle) => puzzle.status === "solved").length;

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Puzzles</h1>
        <p className="muted" data-testid="puzzle-count">
          {shown.length === all.length
            ? `${all.length} ${all.length === 1 ? "puzzle" : "puzzles"}`
            : `${shown.length} of ${all.length} puzzles`}
          {showProgress ? `, ${solved} solved` : null}
        </p>
      </div>

      <DifficultyStrip
        state={state}
        tallies={difficultyTallies(all, state.filters)}
        showProgress={showProgress}
      />

      <div className={styles.toolbar}>
        <FilterBar state={state} repos={repos} tags={tags} />
        <GroupBy state={state} />
      </div>

      {groups.length === 0 ? (
        <p className="notice" data-testid="no-matches">
          No puzzles match these filters.
        </p>
      ) : state.group === "none" ? (
        <PuzzleTable puzzles={shown} state={state} />
      ) : (
        groups.map((group) => (
          <PuzzleGroupSection
            key={group.key}
            group={group}
            state={state}
            difficulty={state.group === "difficulty" ? group.key : undefined}
            omit={state.group === "difficulty" ? "difficulty" : state.group === "repo" ? "repo" : undefined}
            showProgress={showProgress}
          />
        ))
      )}
    </main>
  );
}
