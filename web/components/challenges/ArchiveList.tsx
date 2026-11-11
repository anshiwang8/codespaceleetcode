import Link from "next/link";
import styles from "@/components/challenges/challenges.module.css";
import { ChallengeStatus } from "@/components/challenges/ChallengeStatus";
import { challengeState, shortPeriodLabel } from "@/components/challenges/copy";
import type { ChallengeCard } from "@/lib/api-types";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";

interface ArchiveListProps {
  items: ChallengeCard[];
  signedIn: boolean;
}

/** Past challenge periods, newest first, each with its puzzle and the user's result. */
export function ArchiveList({ items, signedIn }: ArchiveListProps) {
  return (
    <ol className={styles.archive} data-testid="archive-list">
      {items.map((item) => (
        <li
          key={item.periodStart}
          className={styles.archiveItem}
          data-testid="archive-item"
          data-period={item.periodStart}
        >
          <time className={styles.archiveDate} dateTime={item.periodStart}>
            {shortPeriodLabel(item)}
          </time>
          {item.puzzle ? (
            <>
              <span className={styles.archiveMain}>
                <Link href={`/puzzles/${item.puzzle.slug}`} className={styles.archiveTitle}>
                  {item.puzzle.title}
                </Link>
                <span className={styles.archiveMeta}>
                  {TYPE_LABELS[item.puzzle.type]} in {item.puzzle.repoSlug}
                </span>
              </span>
              <span className={styles.archiveTags}>
                <span className={`chip difficulty-${item.puzzle.difficulty}`}>
                  {DIFFICULTY_LABELS[item.puzzle.difficulty]}
                </span>
                {signedIn ? <ChallengeStatus state={challengeState(item)} past /> : null}
              </span>
            </>
          ) : (
            <span className={`${styles.archiveMain} ${styles.withdrawn}`}>This puzzle has been withdrawn.</span>
          )}
        </li>
      ))}
    </ol>
  );
}
