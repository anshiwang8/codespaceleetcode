/** The leaderboard's title and lede, shared by the page and its loading screen. */
export function LeaderboardHeader() {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">Leaderboard</h1>
        <p className="page-lede">
          Points from solving puzzles, for people who chose to appear here. Joining is optional and off until you turn
          it on.
        </p>
      </div>
    </div>
  );
}
