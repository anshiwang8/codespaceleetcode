import styles from "@/components/challenges/challenges.module.css";
import { Icon } from "@/components/site/Icon";
import { formatDay } from "@/lib/format";
import { streakCalendar, type StreakDay } from "@/lib/streak-display";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const WORDS: Record<StreakDay["state"], string> = {
  completed: "completed",
  missed: "not completed",
  open: "not completed yet",
  future: "upcoming",
};

interface StreakCalendarProps {
  /** The server's UTC date, YYYY-MM-DD. Never the browser's clock. */
  today: string;
  /** Completed UTC dates, from ChallengeStreak.recentDays. */
  completedDays: readonly string[];
}

/**
 * The last five weeks of daily challenges, Monday first, in UTC days. A completed day is filled
 * and carries a check, today has a ring, and days still to come are faint. Every day is labeled
 * in words.
 */
export function StreakCalendar({ today, completedDays }: StreakCalendarProps) {
  const days = streakCalendar(today, completedDays);
  return (
    <div className={styles.calendar} data-testid="challenge-streak-calendar">
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((letter, index) => (
          <span key={index}>{letter}</span>
        ))}
      </div>
      <ol className={styles.days} aria-label="Daily challenges, last five weeks (UTC)">
        {days.map(({ day, state, today: isToday }) => (
          <li key={day} className={styles.day} data-day={day} data-state={state} data-today={isToday ? "true" : undefined}>
            {state === "completed" ? <Icon name="check" /> : null}
            <span className="visually-hidden">
              {formatDay(day)}
              {isToday ? ", today" : ""}: {WORDS[state]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
