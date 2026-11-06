import Link from "next/link";
import styles from "@/components/profile/profile.module.css";
import type { UnfinishedPuzzle } from "@/lib/api-types";
import { PUZZLES_PATH } from "@/lib/browse";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { formatDate, plural } from "@/lib/format";

interface ContinuePracticingProps {
  unfinished: UnfinishedPuzzle[];
  /** Whether the user has submitted anything at all, which changes what the empty state says. */
  hasSubmissions: boolean;
  /** Whether every published puzzle is solved. */
  allSolved: boolean;
}

/** Puzzles attempted and not solved yet, most recently attempted first. */
export function ContinuePracticing({ unfinished, hasSubmissions, allSolved }: ContinuePracticingProps) {
  return (
    <section aria-labelledby="continue-heading" className={styles.section} data-testid="continue-practicing">
      <div className={styles.sectionHeader}>
        <h2 id="continue-heading" className="section-title">
          Continue practicing
        </h2>
        {unfinished.length > 0 ? (
          <p className={styles.sectionNote}>
            Puzzles you&apos;ve attempted but not solved. Each one opens fresh: earlier selections aren&apos;t
            saved.
          </p>
        ) : null}
      </div>
      {unfinished.length === 0 ? (
        <div className="empty" data-testid="continue-empty">
          {allSolved ? (
            <strong>You&apos;ve solved every available puzzle. Nice work.</strong>
          ) : hasSubmissions ? (
            <strong>Nothing unfinished. Every puzzle you&apos;ve attempted is solved.</strong>
          ) : (
            <strong>You haven&apos;t attempted a puzzle yet.</strong>
          )}
          <span>
            {allSolved
              ? "New puzzles are added over time, so check back."
              : "Pick a puzzle by difficulty, topic or repository and start reading."}
          </span>
          <Link href={PUZZLES_PATH} className="btn btn-primary btn-small">
            Browse puzzles
          </Link>
        </div>
      ) : (
        <ul className={styles.unfinished}>
          {unfinished.map((puzzle) => (
            <li key={puzzle.slug} className={`card ${styles.unfinishedCard}`} data-testid={`unfinished-${puzzle.slug}`}>
              <Link href={`/puzzles/${puzzle.slug}`} className={styles.unfinishedTitle}>
                {puzzle.title}
              </Link>
              <p className={styles.unfinishedMeta}>
                <span className="chip">{TYPE_LABELS[puzzle.type]}</span>
                <span className={`chip difficulty-${puzzle.difficulty}`}>{DIFFICULTY_LABELS[puzzle.difficulty]}</span>
                <span className="mono faint">{puzzle.repoSlug}</span>
              </p>
              <p className={styles.unfinishedStats}>
                {plural(puzzle.attempts, "attempt", "attempts")}
                {puzzle.lastSubmittedAt ? (
                  <>
                    {" · "}last submitted{" "}
                    <time dateTime={puzzle.lastSubmittedAt}>{formatDate(puzzle.lastSubmittedAt)}</time>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
