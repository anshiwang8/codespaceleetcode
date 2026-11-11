import Link from "next/link";
import styles from "@/components/challenges/challenges.module.css";
import { TimeLeft } from "@/components/challenges/TimeLeft";
import { Icon } from "@/components/site/Icon";
import type { ChallengeCard } from "@/lib/api-types";
import { DIFFICULTY_LABELS } from "@/lib/client/labels";

interface TodayStripProps {
  card: ChallengeCard;
  /** The server's clock, ChallengesResponse.now. */
  now: string;
  signedIn: boolean;
}

/** One quiet line on the puzzle list: today's daily challenge, when it ends, and the way to the rest. */
export function TodayStrip({ card, now, signedIn }: TodayStripProps) {
  if (!card.puzzle) return null;
  return (
    <aside className={styles.strip} aria-label="Today's challenge" data-testid="today-challenge">
      <span className={styles.stripLabel}>
        <Icon name="calendar" />
        Today&apos;s challenge
      </span>
      <Link href={`/puzzles/${card.puzzle.slug}`} className={styles.stripTitle} data-testid="today-challenge-puzzle">
        {card.puzzle.title}
      </Link>
      <span className={`chip difficulty-${card.puzzle.difficulty}`}>{DIFFICULTY_LABELS[card.puzzle.difficulty]}</span>
      {signedIn && card.completed ? (
        <span className="badge badge-ok" data-testid="today-challenge-completed">
          <Icon name="status-solved" />
          Completed
        </span>
      ) : (
        <span className={styles.stripTime}>
          <TimeLeft endsAt={card.endsAt} serverNow={now} prefix="Ends in " />
        </span>
      )}
      <Link href="/challenges" className={styles.stripLink} data-testid="today-challenge-all">
        All challenges
      </Link>
    </aside>
  );
}
