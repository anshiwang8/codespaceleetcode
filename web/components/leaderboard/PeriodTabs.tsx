import Link from "next/link";
import styles from "@/components/leaderboard/leaderboard.module.css";
import { leaderboardHref } from "@/components/leaderboard/links";
import { LEADERBOARD_PERIODS, LEADERBOARD_PERIOD_LABELS, type LeaderboardPeriod } from "@/lib/periods";

/** All time, Today, This week, This month: links, so each period has its own URL. */
export function PeriodTabs({ period }: { period: LeaderboardPeriod }) {
  return (
    <nav aria-label="Leaderboard period">
      <ul className={styles.segmented}>
        {LEADERBOARD_PERIODS.map((option) => (
          <li key={option}>
            <Link
              href={leaderboardHref(option)}
              aria-current={option === period ? "page" : undefined}
              data-testid={`leaderboard-period-${option}`}
            >
              {LEADERBOARD_PERIOD_LABELS[option]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
