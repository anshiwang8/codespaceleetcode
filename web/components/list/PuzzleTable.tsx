import Link from "next/link";
import styles from "@/components/list/list.module.css";
import type { PuzzleStatus, PuzzleSummary } from "@/lib/api-types";
import { browseHref, nextSort, type BrowseState, type SortColumn } from "@/lib/browse";
import { DIFFICULTY_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { topicLabel } from "@/lib/topics";

/** A column a group heading already states, so each row doesn't repeat it. */
export type OmittedColumn = "difficulty" | "repo";

const STATUS_GLYPHS: Record<PuzzleStatus, string> = {
  unsolved: "·",
  attempted: "○",
  solved: "✓",
};

interface PuzzleTableProps {
  puzzles: PuzzleSummary[];
  /** The list's state, which the column headers link from to sort. */
  state: BrowseState;
  omit?: OmittedColumn;
}

/**
 * A column header that sorts by its column: A to Z on the first click, except difficulty, which goes
 * easiest first, and reversed on the next. Links, so the order lives in the URL.
 */
function SortHeader({ state, column, label }: { state: BrowseState; column: SortColumn; label: string }) {
  const active = state.sort?.column === column ? state.sort : undefined;
  return (
    <th
      scope="col"
      aria-sort={active ? (active.descending ? "descending" : "ascending") : undefined}
      className={styles.sortable}
    >
      <Link href={browseHref({ ...state, sort: nextSort(state.sort, column) })} data-testid={`sort-${column}`}>
        {label}
        <span aria-hidden="true" className={styles.sortMark}>
          {active ? (active.descending ? "▼" : "▲") : ""}
        </span>
      </Link>
    </th>
  );
}

export function PuzzleTable({ puzzles, state, omit }: PuzzleTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortHeader state={state} column="status" label="Status" />
          <SortHeader state={state} column="title" label="Puzzle" />
          <SortHeader state={state} column="type" label="Type" />
          {omit === "difficulty" ? null : <SortHeader state={state} column="difficulty" label="Difficulty" />}
          {omit === "repo" ? null : <SortHeader state={state} column="repo" label="Repo" />}
          <SortHeader state={state} column="tags" label="Tags" />
        </tr>
      </thead>
      <tbody>
        {puzzles.map((puzzle) => (
          <tr key={puzzle.slug} data-testid={`puzzle-row-${puzzle.slug}`}>
            <td className={`${styles.status} status-${puzzle.status}`}>
              <span aria-hidden="true" className={styles.glyph}>
                {STATUS_GLYPHS[puzzle.status]}
              </span>
              <span className={styles.statusText}>{STATUS_LABELS[puzzle.status]}</span>
            </td>
            <td className={styles.title}>
              <Link href={`/puzzles/${puzzle.slug}`}>{puzzle.title}</Link>
            </td>
            <td className={styles.type}>{TYPE_LABELS[puzzle.type]}</td>
            {omit === "difficulty" ? null : (
              <td className={`${styles.difficulty} difficulty-${puzzle.difficulty}`}>
                {DIFFICULTY_LABELS[puzzle.difficulty]}
              </td>
            )}
            {omit === "repo" ? null : (
              <td className={styles.repo}>
                <span className="mono">{puzzle.repoSlug}</span>{" "}
                <span className="muted">{puzzle.language}</span>
              </td>
            )}
            <td className={styles.tags}>
              {puzzle.tags.map((tag) => (
                <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="chip">
                  {topicLabel(tag)}
                </Link>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
