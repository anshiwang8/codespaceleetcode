import Link from "next/link";
import styles from "@/components/challenges/challenges.module.css";
import { ChallengeStatus } from "@/components/challenges/ChallengeStatus";
import {
  challengeName,
  challengeState,
  listInWords,
  PERIOD_NOUNS,
  relatedAchievements,
  ROTATION,
} from "@/components/challenges/copy";
import { LocalRotation } from "@/components/challenges/LocalRotation";
import { TimeLeft } from "@/components/challenges/TimeLeft";
import { Icon } from "@/components/site/Icon";
import type { ChallengeCard } from "@/lib/api-types";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { formatDateTime, formatNumber } from "@/lib/format";

interface ChallengeCardViewProps {
  card: ChallengeCard;
  /** The server's clock, ChallengesResponse.now. */
  now: string;
  signedIn: boolean;
}

function stateNote(card: ChallengeCard): string {
  const noun = PERIOD_NOUNS[card.kind];
  switch (challengeState(card)) {
    case "completed":
      return card.completedAt ? `Completed ${formatDateTime(card.completedAt)}.` : "Completed.";
    case "solved-elsewhere":
      return `You solved this puzzle before this ${noun} began, so it doesn't count toward this challenge.`;
    case "attempted":
      return `You've attempted this puzzle. Solve it this ${noun} to complete the challenge.`;
    case "not-started":
      return `Solve it before the ${noun} ends to complete the challenge.`;
  }
}

/** One open challenge: its puzzle, when it ends, the reward, and where the user stands. */
export function ChallengeCardView({ card, now, signedIn }: ChallengeCardViewProps) {
  const headingId = `challenge-${card.kind}-heading`;
  const achievements = relatedAchievements(card.kind);
  const state = challengeState(card);
  return (
    <article
      className={`card ${styles.challenge}`}
      aria-labelledby={headingId}
      data-testid={`challenge-${card.kind}`}
      data-completed={card.completed ? "true" : "false"}
    >
      <header className={styles.challengeHead}>
        <h2 id={headingId} className={styles.kind}>
          <Icon name="calendar" />
          {challengeName(card.kind)}
        </h2>
        <span className={styles.bonus} data-testid="challenge-bonus">
          +{formatNumber(card.bonus)} bonus points
        </span>
      </header>
      <p className={styles.period}>{card.label}</p>

      {card.puzzle ? (
        <div className={styles.puzzle}>
          <Link href={`/puzzles/${card.puzzle.slug}`} className={styles.puzzleTitle} data-testid="challenge-puzzle">
            {card.puzzle.title}
          </Link>
          <p className={styles.meta}>
            <span className={`chip difficulty-${card.puzzle.difficulty}`}>{DIFFICULTY_LABELS[card.puzzle.difficulty]}</span>
            <span className="chip">{TYPE_LABELS[card.puzzle.type]}</span>
            <span className={styles.repo}>{card.puzzle.repoSlug}</span>
          </p>
        </div>
      ) : (
        <p className={styles.withdrawn} data-testid="challenge-withdrawn">
          This challenge&apos;s puzzle has been withdrawn. A new challenge starts when this one ends.
        </p>
      )}

      <dl className={styles.timing}>
        <div>
          <dt>Ends in</dt>
          <dd className={styles.timeLeft}>
            <TimeLeft endsAt={card.endsAt} serverNow={now} />
          </dd>
        </div>
        <div>
          <dt className="visually-hidden">Rotation</dt>
          <dd className={styles.rotation} data-testid="challenge-rotation">
            {ROTATION[card.kind]}
            <LocalRotation kind={card.kind} endsAt={card.endsAt} />
          </dd>
        </div>
      </dl>

      {signedIn && card.puzzle ? (
        <div className={styles.state}>
          <ChallengeStatus state={state} />
          <p className={styles.stateNote}>{stateNote(card)}</p>
        </div>
      ) : null}

      {achievements.length > 0 ? (
        <p className={styles.reward}>
          <Icon name="award" />
          <span>Counts toward {listInWords(achievements)}.</span>
        </p>
      ) : null}

      {card.puzzle ? (
        <Link
          href={`/puzzles/${card.puzzle.slug}`}
          className={`btn ${state === "completed" ? "" : "btn-primary"} ${styles.open}`}
          aria-describedby={headingId}
        >
          {!signedIn || state === "not-started"
            ? "Start puzzle"
            : state === "completed"
              ? "Open puzzle"
              : state === "solved-elsewhere"
                ? "Open puzzle"
                : "Continue"}
        </Link>
      ) : null}
    </article>
  );
}
