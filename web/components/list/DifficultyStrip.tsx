import Link from "next/link";
import styles from "@/components/list/list.module.css";
import type { Difficulty } from "@/lib/api-types";
import { browseHref, DIFFICULTIES, type BrowseState, type Tally } from "@/lib/browse";
import { DIFFICULTY_LABELS } from "@/lib/client/labels";

interface DifficultyStripProps {
  state: BrowseState;
  tallies: Record<Difficulty, Tally>;
  /** False when signed out, since every puzzle would read as unsolved. */
  showProgress: boolean;
}

/**
 * One bar for the whole catalogue, split by difficulty in proportion to how many puzzles each has.
 * The filled part of each segment is the share solved. Each segment filters to its difficulty, and
 * clicking the selected one clears that filter.
 */
export function DifficultyStrip({ state, tallies, showProgress }: DifficultyStripProps) {
  const selected = state.filters.difficulty;
  return (
    <nav aria-label="Difficulty" className={styles.strip}>
      {DIFFICULTIES.map((difficulty) => {
        const { total, solved } = tallies[difficulty];
        const isSelected = selected === difficulty;
        const href = browseHref({
          ...state,
          filters: { ...state.filters, difficulty: isSelected ? undefined : difficulty },
        });
        const share = total === 0 ? 0 : Math.round((solved / total) * 100);
        return (
          <Link
            key={difficulty}
            href={href}
            className={styles.segment}
            data-difficulty={difficulty}
            data-dimmed={selected !== undefined && !isSelected ? "true" : undefined}
            data-testid={`difficulty-${difficulty}`}
            aria-current={isSelected ? "true" : undefined}
            style={{ flexGrow: Math.max(total, 1) }}
          >
            <span className={styles.segmentBar} aria-hidden="true">
              {showProgress ? <span className={styles.segmentSolved} style={{ width: `${share}%` }} /> : null}
            </span>
            <span className={styles.segmentLabel}>{DIFFICULTY_LABELS[difficulty]}</span>
            <span className={styles.segmentCount}>
              {showProgress ? `${solved} of ${total} solved` : `${total} ${total === 1 ? "puzzle" : "puzzles"}`}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
