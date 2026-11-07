import { ProgressFill } from "@/components/motion/ProgressFill";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { DifficultyStrip } from "@/components/list/DifficultyStrip";
import { FilterBar } from "@/components/list/FilterBar";
import { GroupBy } from "@/components/list/GroupBy";
import { PuzzleGroupSection } from "@/components/list/PuzzleGroupSection";
import { PuzzleTable } from "@/components/list/PuzzleTable";
import styles from "@/components/list/list.module.css";
import { PUZZLE_TYPES } from "@/lib/api-types";
import {
  browseHref,
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
  const type = z.enum(PUZZLE_TYPES).safeParse(params.type);
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
        <h1>No puzzles yet</h1>
        <p className="muted">
          There aren&apos;t any puzzles to show right now. New ones are on the way, so check back soon.
        </p>
        <p className="actions">
          <Link href="/" className="btn">
            Back to home
          </Link>
        </p>
      </main>
    );
  }

  // Sorted before grouping, so every section keeps the chosen order.
  const shown = sortPuzzles(filterPuzzles(all, state.filters), state.sort);
  const groups = groupPuzzles(shown, state.group, state.filters);
  const showProgress = user !== null;
  const solved = shown.filter((puzzle) => puzzle.status === "solved").length;
  const solvedAll = all.filter((puzzle) => puzzle.status === "solved").length;
  const share = all.length === 0 ? 0 : Math.floor((solvedAll / all.length) * 100);
  const filtered = Object.values(state.filters).some(Boolean);

  return (
    <main className={`page ${styles.page}`}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Puzzles</h1>
          <p className="page-lede">
            Each puzzle is set in a real open-source repository. Read the code, find the answer, and
            select it in the editor.
          </p>
        </div>
        {showProgress ? (
          <div className={styles.progress} data-testid="list-progress">
            <p>
              <strong className="tabular">{solvedAll}</strong> of{" "}
              <span className="tabular">{all.length}</span> solved
            </p>
            <div
              className="meter"
              role="progressbar"
              aria-label="Puzzles solved"
              aria-valuemin={0}
              aria-valuemax={all.length}
              aria-valuenow={solvedAll}
              aria-valuetext={`${solvedAll} of ${all.length} ${all.length === 1 ? "puzzle" : "puzzles"} solved`}
            >
              <ProgressFill percent={share} />
            </div>
          </div>
        ) : (
          <p className={styles.progressHint}>Anyone can read the puzzles. Sign in to submit answers and keep track of what you&apos;ve solved.</p>
        )}
      </div>

      <section className={styles.controls} aria-label="Filter and group puzzles">
        <DifficultyStrip
          state={state}
          tallies={difficultyTallies(all, state.filters)}
          showProgress={showProgress}
        />
        <div className={styles.toolbar}>
          <FilterBar state={state} repos={repos} tags={tags} />
          <GroupBy state={state} />
        </div>
      </section>

      <p className={styles.count} data-testid="puzzle-count" aria-live="polite">
        {shown.length === all.length
          ? `${all.length} ${all.length === 1 ? "puzzle" : "puzzles"}`
          : `${shown.length} of ${all.length} ${all.length === 1 ? "puzzle" : "puzzles"}`}
        {showProgress ? `, ${solved} solved` : null}
      </p>

      {groups.length === 0 ? (
        <div className="empty" data-testid="no-matches">
          <strong>No puzzles match these filters.</strong>
          <span>Try a different type, topic or repository, or clear the filters to see everything.</span>
          {filtered ? (
            <Link href={browseHref({ ...state, filters: {} })} className="btn btn-small">
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : state.group === "none" ? (
        <PuzzleTable puzzles={shown} state={state} showStatus={showProgress} />
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
