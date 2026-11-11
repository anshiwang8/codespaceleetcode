import Link from "next/link";
import styles from "@/components/leaderboard/leaderboard.module.css";
import { leaderboardHref, pageWindow } from "@/components/leaderboard/links";
import { formatNumber } from "@/lib/format";
import type { LeaderboardPeriod } from "@/lib/periods";

/** Previous, the page numbers around this one, Next. Links, so every page has a URL. */
export function Pagination({ period, page, totalPages }: { period: LeaderboardPeriod; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  return (
    <nav className={styles.pages} aria-label="Leaderboard pages" data-testid="leaderboard-pages">
      {page > 1 ? (
        <Link className="btn btn-small" href={leaderboardHref(period, page - 1)} rel="prev">
          Previous
        </Link>
      ) : (
        <span className="btn btn-small" aria-disabled="true">
          Previous
        </span>
      )}
      <ul className={styles.pageList}>
        {pageWindow(page, totalPages).map((number, index) =>
          number === null ? (
            <li key={`gap-${index}`} className={styles.pageGap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={number}>
              <Link
                href={leaderboardHref(period, number)}
                className={styles.pageLink}
                aria-current={number === page ? "page" : undefined}
                aria-label={`Page ${formatNumber(number)}`}
              >
                {formatNumber(number)}
              </Link>
            </li>
          ),
        )}
      </ul>
      {page < totalPages ? (
        <Link className="btn btn-small" href={leaderboardHref(period, page + 1)} rel="next">
          Next
        </Link>
      ) : (
        <span className="btn btn-small" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
