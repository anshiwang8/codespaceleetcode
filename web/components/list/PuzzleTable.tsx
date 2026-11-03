import Link from "next/link";
import styles from "@/components/list/list.module.css";
import type { PuzzleStatus, PuzzleSummary } from "@/lib/api-types";
import { DIFFICULTY_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { topicLabel } from "@/lib/topics";

/** A column a group heading already states, so each row doesn't repeat it. */
export type OmittedColumn = "difficulty" | "repo";

const STATUS_GLYPHS: Record<PuzzleStatus, string> = {
  unsolved: "·",
  attempted: "○",
  solved: "✓",
};

export function PuzzleTable({ puzzles, omit }: { puzzles: PuzzleSummary[]; omit?: OmittedColumn }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Status</th>
          <th scope="col">Puzzle</th>
          <th scope="col">Type</th>
          {omit === "difficulty" ? null : <th scope="col">Difficulty</th>}
          {omit === "repo" ? null : <th scope="col">Repo</th>}
          <th scope="col">Tags</th>
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
