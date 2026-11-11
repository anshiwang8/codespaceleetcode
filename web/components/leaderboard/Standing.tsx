import Link from "next/link";
import styles from "@/components/leaderboard/leaderboard.module.css";
import { PERIOD_PHRASES, VISIBILITY_SETTINGS_HREF, leaderboardHref } from "@/components/leaderboard/links";
import { Icon } from "@/components/site/Icon";
import type { LeaderboardYou } from "@/lib/api-types";
import { formatNumber, plural } from "@/lib/format";
import type { LeaderboardPeriod } from "@/lib/periods";

interface StandingProps {
  you: LeaderboardYou | null;
  period: LeaderboardPeriod;
  /** Whether the signed-in user's row is on the page being shown. */
  onThisPage: boolean;
  pageSize: number;
}

/** "125 points and 1 puzzle solved today" */
function totals(you: LeaderboardYou, period: LeaderboardPeriod): string {
  const phrase = PERIOD_PHRASES[period];
  return `${plural(you.points, "point", "points")} and ${plural(you.solved, "puzzle", "puzzles")} solved${phrase ? ` ${phrase}` : ""}`;
}

/**
 * The signed-in user's own standing above the table: their rank when they've joined and scored,
 * or, when they haven't joined, their private points and where to join. Signed out, one line.
 */
export function Standing({ you, period, onThisPage, pageSize }: StandingProps) {
  const phrase = PERIOD_PHRASES[period];

  if (!you) {
    return (
      <p className={styles.signedOut} data-testid="leaderboard-signed-out">
        Sign in to see your own points. You only appear here if you join.
      </p>
    );
  }

  if (!you.participating) {
    return (
      <div className={styles.standing} data-testid="leaderboard-private">
        <span className={styles.standingIcon} aria-hidden="true">
          <Icon name="lock" />
        </span>
        <div className={styles.standingText}>
          <p className={styles.standingTitle}>You&apos;re not on the leaderboard. Your points are private until you join.</p>
          <p className={styles.standingNote} data-testid="leaderboard-private-points">
            Only you can see this: {totals(you, period)}.
          </p>
        </div>
        <Link href={VISIBILITY_SETTINGS_HREF} className="btn btn-small" data-testid="leaderboard-join-link">
          Join in Settings
        </Link>
      </div>
    );
  }

  const name = <strong className={styles.publicName}>{you.publicName}</strong>;
  if (you.rank === null) {
    return (
      <div className={styles.standing} data-testid="leaderboard-you-unranked">
        <span className={styles.standingIcon} aria-hidden="true">
          <Icon name="ranking" />
        </span>
        <div className={styles.standingText}>
          <p className={styles.standingTitle}>
            You&apos;re on the leaderboard as {name}.
          </p>
          <p className={styles.standingNote}>
            {phrase
              ? `You haven't scored ${phrase} yet. Solve a puzzle to appear here.`
              : "Solve a puzzle to appear here."}
          </p>
        </div>
        <Link href={VISIBILITY_SETTINGS_HREF} className="btn btn-small btn-quiet">
          Change in Settings
        </Link>
      </div>
    );
  }

  const yourPage = Math.max(1, Math.ceil(you.rank / pageSize));
  return (
    <div className={styles.standing} data-testid="leaderboard-you">
      <span className={styles.standingIcon} aria-hidden="true">
        <Icon name="ranking" />
      </span>
      <div className={styles.standingText}>
        <p className={styles.standingTitle} data-testid="leaderboard-you-rank">
          Your rank: #{formatNumber(you.rank)}
        </p>
        <p className={styles.standingNote}>
          {totals(you, period)}, as {name}.
        </p>
      </div>
      {onThisPage ? (
        <Link href={VISIBILITY_SETTINGS_HREF} className="btn btn-small btn-quiet">
          Change in Settings
        </Link>
      ) : (
        <Link href={leaderboardHref(period, yourPage)} className="btn btn-small" data-testid="leaderboard-your-page">
          Show my row
        </Link>
      )}
    </div>
  );
}
