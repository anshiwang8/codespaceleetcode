import styles from "@/components/profile/tracker.module.css";
import type { SolveTimeline } from "@/lib/api-types";
import { dayToDate, formatLongDay, formatShortDay, plural } from "@/lib/format";

const WIDTH = 640;
const HEIGHT = 150;
const PAD = { top: 12, right: 12, bottom: 24, left: 34 };
const DAY_MS = 86_400_000;

/** Total puzzles first solved by the end of each date with a new solve, starting from the baseline. */
export function cumulativeSolves(timeline: SolveTimeline): { date: string; added: number; total: number }[] {
  let total = timeline.baseline;
  return timeline.solves.map((day) => {
    total += day.count;
    return { date: day.date, added: day.count, total };
  });
}

/**
 * Distinct puzzles first solved, as a running total over the period. A step line: it rises on
 * the date a puzzle was first solved and stays flat otherwise. It measures recorded first
 * solves, nothing more.
 */
export function SolveChart({ timeline, label }: { timeline: SolveTimeline; label: string }) {
  const points = cumulativeSolves(timeline);
  const added = points.reduce((sum, point) => sum + point.added, 0);
  const end = points.at(-1)?.total ?? timeline.baseline;
  const top = Math.max(end, 1);

  const start = dayToDate(timeline.start).getTime();
  const span = Math.max(dayToDate(timeline.end).getTime() - start, DAY_MS);
  const x = (date: string) =>
    PAD.left + ((dayToDate(date).getTime() - start) / span) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => HEIGHT - PAD.bottom - (value / top) * (HEIGHT - PAD.top - PAD.bottom);

  // Flat at the baseline, then a step up at each date with a first solve, then flat to the end.
  let path = `M ${x(timeline.start)} ${y(timeline.baseline)}`;
  let previous = timeline.baseline;
  for (const point of points) {
    path += ` H ${x(point.date)} V ${y(point.total)}`;
    previous = point.total;
  }
  path += ` H ${x(timeline.end)} V ${y(previous)}`;

  const middle = new Date(start + span / 2).toISOString().slice(0, 10);

  return (
    <section className={`card ${styles.chart}`} aria-labelledby="solves-heading" data-testid="solve-chart">
      <div className={styles.head}>
        <h3 id="solves-heading" className={styles.chartTitle}>
          Puzzles solved over time
        </h3>
        <p className={styles.note}>{label}, UTC</p>
      </div>
      <p className={styles.summary} data-testid="solve-chart-summary">
        {added === 0
          ? `No puzzles first solved in this period. ${end > 0 ? `${plural(end, "puzzle", "puzzles")} solved before it.` : ""}`
          : `${plural(added, "puzzle", "puzzles")} first solved in this period, ${end} in total by ${formatLongDay(timeline.end)}.`}
      </p>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Running total of distinct puzzles first solved, from ${timeline.baseline} on ${formatLongDay(timeline.start)} to ${end} on ${formatLongDay(timeline.end)}.`}
      >
        <line className={styles.axis} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} />
        <line className={styles.gridline} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(top)} y2={y(top)} />
        <text className={styles.tick} x={PAD.left - 6} y={y(0)} textAnchor="end" dominantBaseline="middle">
          0
        </text>
        <text className={styles.tick} x={PAD.left - 6} y={y(top)} textAnchor="end" dominantBaseline="middle">
          {top}
        </text>
        {[timeline.start, middle, timeline.end].map((date, index) => (
          <text
            key={date}
            className={styles.tick}
            x={x(date)}
            y={HEIGHT - 6}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
          >
            {formatShortDay(date)}
          </text>
        ))}
        <path className={styles.line} d={path} />
      </svg>
      <details className={styles.table}>
        <summary>Show first solves as a table</summary>
        {points.length === 0 ? (
          <p className={styles.note}>No first solves in this period.</p>
        ) : (
          <table data-testid="solve-table">
            <caption className="visually-hidden">Dates with first solves, {label}, oldest first, in UTC</caption>
            <thead>
              <tr>
                <th scope="col">Date (UTC)</th>
                <th scope="col">First solved</th>
                <th scope="col">Running total</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">
                    <time dateTime={point.date}>{formatLongDay(point.date)}</time>
                  </th>
                  <td className="tabular">{point.added}</td>
                  <td className="tabular">{point.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}
