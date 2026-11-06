import { ProgressFill } from "@/components/motion/ProgressFill";
import { PuzzleTable, type OmittedColumn } from "@/components/list/PuzzleTable";
import styles from "@/components/list/list.module.css";
import type { BrowseState, PuzzleGroup } from "@/lib/browse";

interface PuzzleGroupSectionProps {
  group: PuzzleGroup;
  state: BrowseState;
  /** Set when grouping by difficulty, so the heading takes that difficulty's color. */
  difficulty?: string;
  omit?: OmittedColumn;
  showProgress: boolean;
}

/** A collapsible section of the list. Its heading says how much of it is solved. */
export function PuzzleGroupSection({ group, state, difficulty, omit, showProgress }: PuzzleGroupSectionProps) {
  const headingId = `group-heading-${group.key}`;
  const share = group.total === 0 ? 0 : Math.round((group.solved / group.total) * 100);
  return (
    <section className={styles.group} aria-labelledby={headingId} data-testid={`group-${group.key}`}>
      <details open>
        <summary className={styles.groupSummary}>
          <h2 id={headingId} className={difficulty ? `difficulty-${difficulty}` : undefined}>
            {group.label}
          </h2>
          <span className={styles.groupMeta}>
            {showProgress
              ? `${group.solved} of ${group.total} solved`
              : `${group.total} ${group.total === 1 ? "puzzle" : "puzzles"}`}
          </span>
          {showProgress ? (
            <span className={`meter ${styles.groupBar}`} aria-hidden="true">
              <ProgressFill percent={share} />
            </span>
          ) : null}
        </summary>
        <div className={styles.groupContent}>
        {group.description ? <p className={styles.groupDescription}>{group.description}</p> : null}
        <PuzzleTable puzzles={group.puzzles} state={state} omit={omit} />
        </div>
      </details>
    </section>
  );
}
