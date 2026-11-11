import styles from "@/components/challenges/challenges.module.css";
import { Icon } from "@/components/site/Icon";
import type { ChallengeStreak, PeriodKind } from "@/lib/api-types";
import { formatNumber, plural } from "@/lib/format";

interface ChallengeStreakPanelProps {
  streak: ChallengeStreak;
  completedCounts: Record<PeriodKind, number>;
}

/** The signed-in user's daily challenge streak, and how many weekly and monthly ones they've done. */
export function ChallengeStreakPanel({ streak, completedCounts }: ChallengeStreakPanelProps) {
  return (
    <section className={`card ${styles.streak}`} aria-labelledby="challenge-streak-heading" data-testid="challenge-streak">
      <h2 id="challenge-streak-heading" className="section-title">
        Your daily challenge streak
      </h2>
      <dl className={styles.figures}>
        <div>
          <dt>Current streak</dt>
          <dd className={styles.figure} data-testid="challenge-streak-current">
            {plural(streak.current, "day", "days")}
          </dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd className={styles.figure} data-testid="challenge-streak-longest">
            {plural(streak.longest, "day", "days")}
          </dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd className={styles.today} data-testid="challenge-streak-today">
            {streak.completedToday ? (
              <span className="badge badge-ok">
                <Icon name="status-solved" />
                Completed today
              </span>
            ) : (
              <span className="badge">
                <Icon name="status-unsolved" />
                Not completed yet
              </span>
            )}
          </dd>
        </div>
        <div className={styles.figureQuiet}>
          <dt>Daily completed</dt>
          <dd className={styles.figure} data-testid="challenge-count-daily">
            {formatNumber(completedCounts.daily)}
          </dd>
        </div>
        <div className={styles.figureQuiet}>
          <dt>Weekly completed</dt>
          <dd className={styles.figure} data-testid="challenge-count-weekly">
            {formatNumber(completedCounts.weekly)}
          </dd>
        </div>
        <div className={styles.figureQuiet}>
          <dt>Monthly completed</dt>
          <dd className={styles.figure} data-testid="challenge-count-monthly">
            {formatNumber(completedCounts.monthly)}
          </dd>
        </div>
      </dl>
      <p className={styles.streakNote}>
        Complete the daily challenge on its UTC day to keep your streak. Solving it on a later day still counts as
        practice but not toward the streak or the bonus. Weekly and monthly challenges are tracked separately and
        don&apos;t affect it.
      </p>
    </section>
  );
}
