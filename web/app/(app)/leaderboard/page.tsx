import type { Metadata } from "next";
import { TooManyRequests } from "@/components/site/TooManyRequests";
import Link from "next/link";
import styles from "@/components/leaderboard/leaderboard.module.css";
import { PERIOD_PHRASES, VISIBILITY_SETTINGS_HREF, leaderboardHref, parsePage, parsePeriod } from "@/components/leaderboard/links";
import { Pagination } from "@/components/leaderboard/Pagination";
import { PeriodTabs } from "@/components/leaderboard/PeriodTabs";
import { RankingTable } from "@/components/leaderboard/RankingTable";
import { ScoringRules } from "@/components/leaderboard/ScoringRules";
import { Standing } from "@/components/leaderboard/Standing";
import type { LeaderboardResponse } from "@/lib/api-types";
import { formatNumber, plural } from "@/lib/format";
import { LEADERBOARD_PERIOD_LABELS, describePeriod, formatTimeLeft, type LeaderboardPeriod } from "@/lib/periods";
import { getCurrentUser } from "@/lib/server/auth";
import { isPageRateLimited } from "@/lib/server/rate-limit";
import { MAX_LEADERBOARD_PAGE, getLeaderboard } from "@/lib/server/leaderboard";

// Public, and rendered per request: the signed-in user's own standing comes from their session.
export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Points from solving codebases puzzles, for people who chose to appear here.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The period's name ("Week of November 9, 2026") and when it ends, from the server's clock. */
function periodText(board: LeaderboardResponse): { title: string; line: string } {
  if (!board.range || board.period === "all") {
    return { title: "All time", line: "Every point earned since scoring started." };
  }
  const left = formatTimeLeft(board.range.endsAt, new Date(board.now));
  return {
    title: describePeriod(board.period, board.range.startsAt.slice(0, 10)),
    line: `Ends at 00:00 UTC${left === "ended" ? "" : `, in ${left}`}.`,
  };
}

function EmptyBoard({ period, joined }: { period: LeaderboardPeriod; joined: boolean | null }) {
  const phrase = PERIOD_PHRASES[period];
  const title = phrase ? `No one has scored ${phrase} yet.` : "No one is on the leaderboard yet.";
  const detail =
    period === "all"
      ? "People appear here once they join in Settings and solve a puzzle."
      : period === "daily"
        ? "Today's board starts fresh at 00:00 UTC. Solve a puzzle to be the first."
        : period === "weekly"
          ? "This week's board started Monday at 00:00 UTC. Solve a puzzle to be the first."
          : "This month's board started on the 1st at 00:00 UTC. Solve a puzzle to be the first.";
  return (
    <div className="empty" data-testid="leaderboard-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
      <p className={styles.emptyActions}>
        <Link href="/puzzles" className="btn btn-small btn-primary">
          Browse puzzles
        </Link>
        {joined === false ? (
          <Link href={VISIBILITY_SETTINGS_HREF} className="btn btn-small">
            Join in Settings
          </Link>
        ) : null}
      </p>
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const page = parsePage(params.page, MAX_LEADERBOARD_PAGE);
  const user = await getCurrentUser();
  if (await isPageRateLimited(user)) return <TooManyRequests />;
  const board = await getLeaderboard(user?.id ?? null, period, page);

  const totalPages = Math.max(1, Math.ceil(board.totalEntries / board.pageSize));
  const onThisPage = board.rows.some((row) => row.isYou);
  const label = LEADERBOARD_PERIOD_LABELS[period];
  const { title, line } = periodText(board);

  return (
    <main className={`page ${styles.page}`} data-testid="leaderboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-lede">
            Points from solving puzzles, for people who chose to appear here. Joining is optional and off until you
            turn it on.
          </p>
        </div>
      </div>

      <section className={`card ${styles.board}`} aria-labelledby="board-heading">
        <div className={styles.boardTop}>
          <PeriodTabs period={period} />
          <div className={styles.periodInfo}>
            <h2 id="board-heading" className={styles.boardHeading}>
              {title}
            </h2>
            <p className={styles.periodLine} data-testid="leaderboard-period-line">
              {line}
            </p>
          </div>
        </div>

        <Standing you={board.you} period={period} onThisPage={onThisPage} pageSize={board.pageSize} />

        {board.totalEntries === 0 ? (
          <EmptyBoard period={period} joined={board.you ? board.you.participating : null} />
        ) : board.rows.length === 0 ? (
          <div className="empty" data-testid="leaderboard-past-end">
            <strong>There&apos;s no page {formatNumber(page)}.</strong>
            <span>
              This board has {plural(totalPages, "page", "pages")} right now. Start again from the top.
            </span>
            <p className={styles.emptyActions}>
              <Link href={leaderboardHref(period)} className="btn btn-small">
                Go to page 1
              </Link>
            </p>
          </div>
        ) : (
          <>
            <RankingTable
              rows={board.rows}
              caption={`${label} leaderboard, page ${formatNumber(page)} of ${formatNumber(totalPages)}`}
            />
            <div className={styles.boardFoot}>
              <p className={styles.count}>
                {plural(board.totalEntries, "person", "people")} ranked
                {totalPages > 1 ? `, page ${formatNumber(page)} of ${formatNumber(totalPages)}` : ""}. On equal
                points, whoever reached the total first ranks higher.
              </p>
              <Pagination period={period} page={page} totalPages={totalPages} />
            </div>
          </>
        )}
      </section>

      <ScoringRules />
    </main>
  );
}
