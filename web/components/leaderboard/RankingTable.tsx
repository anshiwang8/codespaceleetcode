import styles from "@/components/leaderboard/leaderboard.module.css";
import { Avatar } from "@/components/site/Avatar";
import type { LeaderboardRow } from "@/lib/api-types";
import { formatDateTime, formatNumber } from "@/lib/format";

interface RankingTableProps {
  rows: LeaderboardRow[];
  /** Says which board and page this is, for screen readers. */
  caption: string;
}

/**
 * One page of rankings. Every row has the default silhouette, never anyone's picture: uploaded
 * pictures are private to their owner. Below 640px each row becomes a card, and the words a column
 * header gave ("points", "solved") come back next to the numbers.
 */
export function RankingTable({ rows, caption }: RankingTableProps) {
  return (
    <table className={styles.table} data-testid="leaderboard-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={styles.rankHead}>
            Rank
          </th>
          <th scope="col">Name</th>
          <th scope="col" className={styles.numberHead}>
            Points
          </th>
          <th scope="col" className={styles.numberHead}>
            Solved
          </th>
          <th scope="col">Reached first</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.rank}-${row.publicName}`}
            className={row.isYou ? styles.you : undefined}
            data-testid="leaderboard-row"
            data-you={row.isYou ? "true" : undefined}
          >
            <td className={styles.rank}>
              <span className={styles.unit}>#</span>
              {formatNumber(row.rank)}
            </td>
            <th scope="row" className={styles.name}>
              <span className={styles.nameInner}>
                <Avatar version={null} />
                <span className={styles.nameText} data-testid="leaderboard-name">
                  {row.publicName}
                </span>
                {row.isYou ? <span className="badge badge-info">You</span> : null}
              </span>
            </th>
            <td className={styles.points}>
              {formatNumber(row.points)}
              <span className={styles.unit}> points</span>
            </td>
            <td className={styles.solved}>
              {formatNumber(row.solved)}
              <span className={styles.unit}> solved</span>
            </td>
            <td className={styles.reached}>
              <span className={styles.unit}>Reached </span>
              <time dateTime={row.reachedAt}>{formatDateTime(row.reachedAt)}</time>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
