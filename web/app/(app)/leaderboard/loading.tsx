import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import styles from "@/components/leaderboard/leaderboard.module.css";

// Shown the moment someone opens the leaderboard or switches its period, while the rankings load.
// The header is the page's own, so only the board's contents change when it arrives.
export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true" data-testid="leaderboard-loading">
      <p className="visually-hidden" role="status">
        Loading the leaderboard…
      </p>
      <LeaderboardHeader />
      <section className={`card ${styles.board}`} aria-hidden="true">
        <div className={`skeleton ${styles.skeletonTabs}`} />
        <div className={`skeleton ${styles.skeletonRows}`} />
      </section>
    </main>
  );
}
