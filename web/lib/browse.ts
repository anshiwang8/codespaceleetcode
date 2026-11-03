import type { Difficulty, PuzzleSummary, PuzzleType } from "@/lib/api-types";
import { DIFFICULTY_LABELS } from "@/lib/client/labels";
import { isTopic, TOPIC_ORDER, topicDescription, topicLabel } from "@/lib/topics";

// How the puzzle list is filtered, counted and grouped. Pure, so the list page and the tests share it.

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

export interface BrowseFilters {
  type?: PuzzleType;
  difficulty?: Difficulty;
  repo?: string;
  tag?: string;
}

export interface BrowseState {
  filters: BrowseFilters;
  group: Grouping;
}

export interface Tally {
  total: number;
  solved: number;
}

export interface TopicTally extends Tally {
  tag: string;
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
function orderTags(tags: Iterable<string>): string[] {
  const present = new Set(tags);
  const known = TOPIC_ORDER.filter((topic) => present.has(topic));
  const other = [...present].filter((tag) => !isTopic(tag)).sort();
  return [...known, ...other];
}

/**
 * Puzzles per topic under every other filter. Topics with none are left out, except the selected
 * one, so the control for clearing it never disappears.
 */
export function topicTallies(puzzles: PuzzleSummary[], filters: BrowseFilters): TopicTally[] {
  const pool = puzzles.filter((puzzle) => passes(puzzle, filters, "tag"));
  const tags = pool.flatMap((puzzle) => puzzle.tags);
  if (filters.tag) tags.push(filters.tag);
  return orderTags(tags).map((tag) => ({
    tag,
    ...tally(pool.filter((puzzle) => puzzle.tags.includes(tag))),
  }));
}

function group(key: string, label: string, description: string | null, puzzles: PuzzleSummary[]): PuzzleGroup {
  return { key, label, description, puzzles, ...tally(puzzles) };
}

/**
 * Splits already-filtered puzzles into sections, leaving out empty ones. A puzzle with two topics is
 * listed under both. With a topic selected, grouping by topic shows only that topic.
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
          // A selected topic's description is already shown under the topic list.
          filters.tag ? null : topicDescription(tag),
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

/** The list page's URL for a state. Defaults are left out, so the plain list stays at `/`. */
export function browseHref(state: BrowseState): string {
  const params = new URLSearchParams();
  const { type, difficulty, repo, tag } = state.filters;
  if (type) params.set("type", type);
  if (difficulty) params.set("difficulty", difficulty);
  if (repo) params.set("repo", repo);
  if (tag) params.set("tag", tag);
  if (state.group !== DEFAULT_GROUPING) params.set("group", state.group);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
