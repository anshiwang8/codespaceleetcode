import Link from "next/link";
import styles from "@/components/list/list.module.css";
import type { PuzzleStatus, PuzzleSummary } from "@/lib/api-types";
import { browseHref, DEFAULT_GROUPING, nextSort, type BrowseState, type SortColumn } from "@/lib/browse";
import { DIFFICULTY_LABELS, languageLabel, STATUS_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { topicLabel } from "@/lib/topics";
import { Icon, type IconName } from "@/components/site/Icon";
import { IntentLink } from "@/components/site/IntentLink";

/** A column a group heading already states, so each row doesn't repeat it. */
export type OmittedColumn = "difficulty" | "repo";

// Shapes as well as colors, so the status reads without color. The text is always there too.
const STATUS_ICONS: Record<PuzzleStatus, IconName> = {
  unsolved: "status-unsolved",
  attempted: "status-attempted",
  solved: "status-solved",
};

interface PuzzleTableProps {
  puzzles: PuzzleSummary[];
  /** The list's state, which the column headers link from to sort. */
  state: BrowseState;
  omit?: OmittedColumn;
  /** False when signed out: every row would say Not started, so the column is left out. */
  showStatus: boolean;
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
          {active ? <Icon name={active.descending ? "sort-down" : "sort-up"} /> : null}
        </span>
      </Link>
    </th>
  );
}

export function PuzzleTable({ puzzles, state, omit, showStatus }: PuzzleTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {showStatus ? <SortHeader state={state} column="status" label="Status" /> : null}
          <SortHeader state={state} column="title" label="Puzzle" />
          <SortHeader state={state} column="type" label="Type" />
          {omit === "difficulty" ? null : <SortHeader state={state} column="difficulty" label="Difficulty" />}
          {omit === "repo" ? null : <SortHeader state={state} column="repo" label="Repository" />}
          <SortHeader state={state} column="tags" label="Topics" />
        </tr>
      </thead>
      <tbody>
        {puzzles.map((puzzle) => (
          <tr key={puzzle.slug} data-testid={`puzzle-row-${puzzle.slug}`}>
            {showStatus ? (
              <td className={`${styles.status} status-${puzzle.status}`}>
                <Icon name={STATUS_ICONS[puzzle.status]} className={styles.glyph} />
                <span className={styles.statusText}>{STATUS_LABELS[puzzle.status]}</span>
              </td>
            ) : null}
            <td className={styles.title}>
              <IntentLink href={`/puzzles/${puzzle.slug}`}>{puzzle.title}</IntentLink>
            </td>
            <td className={styles.type}>{TYPE_LABELS[puzzle.type]}</td>
            {omit === "difficulty" ? null : (
              <td className={`${styles.difficulty} difficulty-${puzzle.difficulty}`}>
                <span aria-hidden="true" className={styles.dot} />
                {DIFFICULTY_LABELS[puzzle.difficulty]}
              </td>
            )}
            {omit === "repo" ? null : (
              <td className={styles.repo}>
                <span>{puzzle.repoSlug}</span>
                <span className={styles.language}>{languageLabel(puzzle.language)}</span>
              </td>
            )}
            <td className={styles.tags}>
              {puzzle.tags.map((tag) => (
                <IntentLink key={tag} href={browseHref({ filters: { tag }, group: DEFAULT_GROUPING })} className="chip">
                  {topicLabel(tag)}
                </IntentLink>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
