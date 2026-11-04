import type { Difficulty, PuzzleSummary, PuzzleType } from "@/lib/api-types";
import { DIFFICULTY_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { isTopic, TOPIC_ORDER, topicDescription, topicLabel } from "@/lib/topics";

// How the puzzle list is filtered, counted, sorted and grouped. Pure, so the list page and the tests
// share it.

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const GROUPINGS = ["difficulty", "topic", "repo", "none"] as const;
export type Grouping = (typeof GROUPINGS)[number];
export const DEFAULT_GROUPING: Grouping = "difficulty";

export const GROUPING_LABELS: Record<Grouping, string> = {
  difficulty: "Difficulty",
  topic: "Topic",
  repo: "Repo",
  none: "None",
};

/** The table's columns, each of which sorts the rows when its header is clicked. */
export const SORT_COLUMNS = ["status", "title", "type", "difficulty", "repo", "tags"] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export interface Sort {
  column: SortColumn;
  descending: boolean;
}

export interface BrowseFilters {
  type?: PuzzleType;
  difficulty?: Difficulty;
  repo?: string;
  tag?: string;
}

export interface BrowseState {
  filters: BrowseFilters;
  group: Grouping;
  /** Absent means the default order, by puzzle ID. */
  sort?: Sort;
}

export interface Tally {
  total: number;
  solved: number;
}

export interface PuzzleGroup extends Tally {
  key: string;
  label: string;
  description: string | null;
  puzzles: PuzzleSummary[];
}

/** Whether a puzzle passes the filters, optionally leaving one of them out. */
function passes(puzzle: PuzzleSummary, filters: BrowseFilters, ignore?: keyof BrowseFilters): boolean {
  return (
    (ignore === "type" || !filters.type || puzzle.type === filters.type) &&
    (ignore === "difficulty" || !filters.difficulty || puzzle.difficulty === filters.difficulty) &&
    (ignore === "repo" || !filters.repo || puzzle.repoSlug === filters.repo) &&
    (ignore === "tag" || !filters.tag || puzzle.tags.includes(filters.tag))
  );
}

export function filterPuzzles(puzzles: PuzzleSummary[], filters: BrowseFilters): PuzzleSummary[] {
  return puzzles.filter((puzzle) => passes(puzzle, filters));
}

function tally(puzzles: PuzzleSummary[]): Tally {
  return { total: puzzles.length, solved: puzzles.filter((puzzle) => puzzle.status === "solved").length };
}

/** Puzzles per difficulty under every other filter, so each count says what clicking it would show. */
export function difficultyTallies(puzzles: PuzzleSummary[], filters: BrowseFilters): Record<Difficulty, Tally> {
  const pool = puzzles.filter((puzzle) => passes(puzzle, filters, "difficulty"));
  return Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, tally(pool.filter((puzzle) => puzzle.difficulty === difficulty))]),
  ) as Record<Difficulty, Tally>;
}

/** Listed topics first, in their fixed order, then any other tag alphabetically. */
export function orderTags(tags: Iterable<string>): string[] {
  const present = new Set(tags);
  const known = TOPIC_ORDER.filter((topic) => present.has(topic));
  const other = [...present].filter((tag) => !isTopic(tag)).sort();
  return [...known, ...other];
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** What each column sorts by: the text the row shows, except difficulty, which goes easiest first. */
const SORT_KEYS: Record<SortColumn, (puzzle: PuzzleSummary) => string | number> = {
  status: (puzzle) => STATUS_LABELS[puzzle.status],
  title: (puzzle) => puzzle.title,
  type: (puzzle) => TYPE_LABELS[puzzle.type],
  difficulty: (puzzle) => DIFFICULTIES.indexOf(puzzle.difficulty),
  repo: (puzzle) => puzzle.repoSlug,
  // By the topics as the row lists them, so rows with the same first topic go by their second.
  tags: (puzzle) => puzzle.tags.map(topicLabel).join("\u0000"),
};

/** A stable sort, so rows that tie keep their default order by puzzle ID. */
export function sortPuzzles(puzzles: PuzzleSummary[], sort: Sort | undefined): PuzzleSummary[] {
  if (!sort) return puzzles;
  const key = SORT_KEYS[sort.column];
  const direction = sort.descending ? -1 : 1;
  return [...puzzles].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : collator.compare(String(left), String(right));
    return order * direction;
  });
}

/** Clicking a column sorts by it A to Z, and clicking the sorted column again reverses it. */
export function nextSort(current: Sort | undefined, column: SortColumn): Sort {
  return { column, descending: current?.column === column ? !current.descending : false };
}

function group(key: string, label: string, description: string | null, puzzles: PuzzleSummary[]): PuzzleGroup {
  return { key, label, description, puzzles, ...tally(puzzles) };
}

/**
 * Splits already-filtered puzzles into sections, keeping their order and leaving out empty ones. A
 * puzzle with two topics is listed under both. With a topic selected, grouping by topic shows only
 * that topic.
 */
export function groupPuzzles(puzzles: PuzzleSummary[], grouping: Grouping, filters: BrowseFilters): PuzzleGroup[] {
  switch (grouping) {
    case "difficulty":
      return DIFFICULTIES.map((difficulty) =>
        group(
          difficulty,
          DIFFICULTY_LABELS[difficulty],
          null,
          puzzles.filter((puzzle) => puzzle.difficulty === difficulty),
        ),
      ).filter((section) => section.total > 0);
    case "topic": {
      const tags = filters.tag ? [filters.tag] : orderTags(puzzles.flatMap((puzzle) => puzzle.tags));
      const sections = tags.map((tag) =>
        group(
          tag,
          topicLabel(tag),
          topicDescription(tag),
          puzzles.filter((puzzle) => puzzle.tags.includes(tag)),
        ),
      );
      const untagged = filters.tag ? [] : puzzles.filter((puzzle) => puzzle.tags.length === 0);
      sections.push(group("no-topic", "No topic", null, untagged));
      return sections.filter((section) => section.total > 0);
    }
    case "repo": {
      const repos = [...new Set(puzzles.map((puzzle) => puzzle.repoSlug))].sort();
      return repos.map((repo) => {
        const members = puzzles.filter((puzzle) => puzzle.repoSlug === repo);
        return group(repo, repo, members[0]?.language ?? null, members);
      });
    }
    case "none":
      return puzzles.length === 0 ? [] : [group("all", "All puzzles", null, puzzles)];
  }
}

/** Reads `sort=title` or `sort=-title`. Anything else means the default order. */
export function parseSort(value: string | string[] | undefined): Sort | undefined {
  if (typeof value !== "string") return undefined;
  const descending = value.startsWith("-");
  const column = descending ? value.slice(1) : value;
  return (SORT_COLUMNS as readonly string[]).includes(column)
    ? { column: column as SortColumn, descending }
    : undefined;
}

/** The list page's URL for a state. Defaults are left out, so the plain list stays at `/`. */
export function browseHref(state: BrowseState): string {
  const params = new URLSearchParams();
  const { type, difficulty, repo, tag } = state.filters;
  if (type) params.set("type", type);
  if (difficulty) params.set("difficulty", difficulty);
  if (repo) params.set("repo", repo);
  if (tag) params.set("tag", tag);
  if (state.group !== DEFAULT_GROUPING) params.set("group", state.group);
  if (state.sort) params.set("sort", `${state.sort.descending ? "-" : ""}${state.sort.column}`);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
