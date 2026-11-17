import styles from "@/components/challenges/challenges.module.css";
import { StreakBar } from "@/components/challenges/StreakBar";
import { StreakCalendar } from "@/components/challenges/StreakCalendar";
import { Icon } from "@/components/site/Icon";
import type { ChallengeStreak, PeriodKind } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";

interface ChallengeStreakPanelProps {
  streak: ChallengeStreak;
  completedCounts: Record<PeriodKind, number>;
  /** The server's clock, ChallengesResponse.now. Its UTC date is the calendar's today. */
  now: string;
}

/**
 * The signed-in user's daily challenge streak: the number, a bar toward the longest streak or the
 * next milestone, the last five weeks, and the counts. The rule for keeping a streak is under
 * "How challenges work".
 */
export function ChallengeStreakPanel({ streak, completedCounts, now }: ChallengeStreakPanelProps) {
  // An ISO timestamp is UTC, so its first ten characters are the UTC date.
  const today = new Date(now).toISOString().slice(0, 10);
  const stats: { label: string; value: number; testId?: string }[] = [
    { label: "Current", value: streak.current },
    { label: "Longest", value: streak.longest, testId: "challenge-streak-longest" },
    { label: "Daily completed", value: completedCounts.daily, testId: "challenge-count-daily" },
    { label: "Weekly completed", value: completedCounts.weekly, testId: "challenge-count-weekly" },
    { label: "Monthly completed", value: completedCounts.monthly, testId: "challenge-count-monthly" },
  ];
  return (
    <section
      className={`card ${styles.panel} ${styles.streak}`}
      aria-labelledby="challenge-streak-heading"
      data-testid="challenge-streak"
    >
      <div className={styles.streakMain}>
        <header className={styles.streakHead}>
          <h2 id="challenge-streak-heading" className="section-title">
            Daily streak
          </h2>
          <span className={`badge ${streak.completedToday ? "badge-ok" : ""}`} data-testid="challenge-streak-today">
            <Icon name={streak.completedToday ? "status-solved" : "status-unsolved"} />
            {streak.completedToday ? "Completed today" : "Not completed yet"}
          </span>
        </header>
        <div className={styles.streakNumber} data-testid="challenge-streak-current">
          <span className={styles.streakCount}>{formatNumber(streak.current)}</span>{" "}
          <span className={styles.streakUnit}>{streak.current === 1 ? "day" : "days"}</span>
        </div>
        <StreakBar current={streak.current} longest={streak.longest} />
      </div>

      <StreakCalendar today={today} completedDays={streak.recentDays} />

      <dl className={styles.stats}>
        {stats.map(({ label, value, testId }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-testid={testId}>{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
