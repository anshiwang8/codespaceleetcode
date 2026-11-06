import styles from "@/components/profile/profile.module.css";
import type { ActivityDay, ProfileActivity } from "@/lib/api-types";
import { dayToDate, formatDay, formatMonth, plural } from "@/lib/format";

/** Shade steps by submissions that day. */
function level(submissions: number): 0 | 1 | 2 | 3 | 4 {
  if (submissions === 0) return 0;
  if (submissions === 1) return 1;
  if (submissions <= 3) return 2;
  if (submissions <= 6) return 3;
  return 4;
}

function describe(day: ActivityDay): string {
  if (day.submissions === 0) return `${formatDay(day.date)}: no submissions`;
  return `${formatDay(day.date)}: ${plural(day.submissions, "submission", "submissions")}, ${day.passed} correct`;
}

/**
 * The last 90 days as a grid of weeks, Sunday at the top. The grid is a picture for sighted
 * users; the summary and the list of active days below it say the same thing in text.
 */
export function ActivityCalendar({ activity }: { activity: ProfileActivity }) {
  const first = activity.days[0];
  // Blank cells before the first day line it up with its weekday.
  const lead = first ? dayToDate(first.date).getUTCDay() : 0;
  const cells: (ActivityDay | null)[] = [...Array.from({ length: lead }, () => null), ...activity.days];
  const weeks = Math.ceil(cells.length / 7);
  // A month's name over the first week that starts in it.
  const months = Array.from({ length: weeks }, (_, week) => {
    const days = cells.slice(week * 7, week * 7 + 7).filter((cell): cell is ActivityDay => cell !== null);
    const firstOfMonth = days.find((day) => day.date.endsWith("-01"));
    if (week === 0 && days[0]) return formatMonth(days[0].date);
    return firstOfMonth ? formatMonth(firstOfMonth.date) : "";
  });
  const active = activity.days.filter((day) => day.submissions > 0);
  const firstDay = activity.days[0];
  const lastDay = activity.days.at(-1);

  return (
    <section className={`card ${styles.activity}`} aria-labelledby="activity-heading" data-testid="activity">
      <div className={styles.sectionHeader}>
        <h2 id="activity-heading" className="section-title">
          Activity
        </h2>
        <p className={styles.sectionNote} data-testid="activity-summary">
          {activity.submissions === 0
            ? "No submissions in the last 90 days."
            : `${plural(activity.submissions, "submission", "submissions")} on ${plural(activity.activeDays, "day", "days")} in the last 90 days.`}
        </p>
      </div>
      <div className={styles.calendarScroll}>
        <div className={styles.calendar} style={{ "--weeks": weeks } as React.CSSProperties} aria-hidden="true">
          <div className={styles.calendarMonths}>
            {months.map((month, week) => (
              <span key={week}>{month}</span>
            ))}
          </div>
          <div className={styles.calendarWeekdays}>
            <span />
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
          </div>
          <div className={styles.calendarGrid}>
            {cells.map((day, index) =>
              day ? (
                <span
                  key={day.date}
                  className={styles.cell}
                  data-level={level(day.submissions)}
                  data-date={day.date}
                  title={describe(day)}
                />
              ) : (
                <span key={`blank-${index}`} className={styles.cellBlank} />
              ),
            )}
          </div>
        </div>
      </div>
      <div className={styles.calendarFooter}>
        <p className={styles.cardNote}>
          Each square is one day in UTC
          {firstDay && lastDay ? `, ${formatDay(firstDay.date)} to ${formatDay(lastDay.date)}` : ""}. Activity
          counts every answer you submitted, right or wrong.
        </p>
        <p className={styles.legend} aria-hidden="true">
          Less
          {([0, 1, 2, 3, 4] as const).map((step) => (
            <span key={step} className={styles.cell} data-level={step} />
          ))}
          More
        </p>
      </div>
      <details className={styles.activityDetails}>
        <summary>Show active days as a list</summary>
        {active.length === 0 ? (
          <p className={styles.cardNote}>No active days in this period.</p>
        ) : (
          <table className={styles.activityTable} data-testid="activity-table">
            <caption className="visually-hidden">Days with submissions in the last 90 days, newest first, in UTC</caption>
            <thead>
              <tr>
                <th scope="col">Day (UTC)</th>
                <th scope="col">Submissions</th>
                <th scope="col">Correct</th>
              </tr>
            </thead>
            <tbody>
              {[...active].reverse().map((day) => (
                <tr key={day.date}>
                  <th scope="row">
                    <time dateTime={day.date}>{formatDay(day.date)}</time>
                  </th>
                  <td className="tabular">{day.submissions}</td>
                  <td className="tabular">{day.passed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}
