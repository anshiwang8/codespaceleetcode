import Link from "next/link";
import styles from "@/components/challenges/challenges.module.css";
import { challengeState, type ChallengeState } from "@/components/challenges/copy";
import { TimeLeft } from "@/components/challenges/TimeLeft";
import { Icon } from "@/components/site/Icon";
import type { ChallengeCard } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";
import { PERIOD_LABELS } from "@/lib/periods";

interface ChallengeBarProps {
  card: ChallengeCard;
  /** The server's clock, ChallengesResponse.now. */
  now: string;
  signedIn: boolean;
}

/** What the button says for each state. Solved before the period began leaves nothing to start. */
const ACTION: Record<ChallengeState, string> = {
  "not-started": "Start",
  attempted: "Continue",
  completed: "Completed",
  // Solved before the period began: done, but it earned no bonus, so it doesn't say "Completed".
  "solved-elsewhere": "Solved",
};

/**
 * One open challenge as a single row: its type, when it ends, its points and one button. The
 * columns have fixed widths, so the three bars' columns line up. The rules, the rotation times and
 * what a streak needs are under "How challenges work".
 */
export function ChallengeBar({ card, now, signedIn }: ChallengeBarProps) {
  const headingId = `challenge-${card.kind}-heading`;
  // Signed out there's no state, so the button always offers a start.
  const state: ChallengeState = signedIn ? challengeState(card) : "not-started";
  const done = state === "completed" || state === "solved-elsewhere";
  return (
    <article
      className={`card ${styles.bar}`}
      aria-labelledby={headingId}
      data-testid={`challenge-${card.kind}`}
      data-completed={card.completed ? "true" : "false"}
    >
      <h2 id={headingId} className={styles.barKind}>
        <Icon name="calendar" />
        {PERIOD_LABELS[card.kind]}
        <span className="visually-hidden"> challenge</span>
      </h2>

      <p className={styles.barEnds}>
        <span className={styles.barLabel}>Ends in</span>
        <span className={styles.barTime}>
          <TimeLeft endsAt={card.endsAt} serverNow={now} />
        </span>
      </p>

      <p className={styles.barPoints} data-testid="challenge-bonus">
        +{formatNumber(card.bonus)}&nbsp;pts
      </p>

      <div className={styles.barAction}>
        {card.puzzle ? (
          <Link
            href={`/puzzles/${card.puzzle.slug}`}
            className={done ? `btn btn-quiet ${styles.barDone}` : "btn btn-primary btn-forward"}
            aria-describedby={headingId}
            data-testid="challenge-puzzle"
            data-state={state}
          >
            {done ? <Icon name="check" /> : null}
            {ACTION[state]}
            {done ? null : <Icon name="arrow-right" />}
          </Link>
        ) : (
          <span className={styles.barWithdrawn} data-testid="challenge-withdrawn">
            Withdrawn
          </span>
        )}
      </div>
    </article>
  );
}
