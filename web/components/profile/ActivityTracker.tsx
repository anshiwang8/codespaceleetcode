"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/profile/tracker.module.css";
import { ACTIVITY_LEVELS, activityLevel, calendarLayout, describeDay } from "@/lib/activity";
import type { ActivityPeriodKey, PracticeStreaks, ProfileActivity } from "@/lib/api-types";
import { formatDay, formatLongDay, formatNumber, plural } from "@/lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface ActivityTrackerProps {
  activity: ProfileActivity;
  streaks: PracticeStreaks;
  /** True while another period is loading; the shown calendar stays until it arrives. */
  loading: boolean;
  /** The period asked for last, which differs from the shown one while it loads. */
  requested: ActivityPeriodKey;
  error: string | null;
  onPeriodChange: (period: ActivityPeriodKey) => void;
  onRetry: () => void;
  /** The date filtering history, or null. */
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

/**
 * A GitHub-style daily calendar of graded submissions, with lifetime streaks above it. The grid
 * has one Tab stop; arrow keys move by day (up and down) and by week (left and right), and Enter
 * picks a date to filter the history below.
 */
export function ActivityTracker({
  activity,
  streaks,
  loading,
  requested,
  error,
  onPeriodChange,
  onRetry,
  selectedDate,
  onSelectDate,
}: ActivityTrackerProps) {
  const { weeks, months } = useMemo(() => calendarLayout(activity.days), [activity.days]);
  const indexByDate = useMemo(() => new Map(activity.days.map((day, index) => [day.date, index])), [activity.days]);

  // The roving tab stop: the selected date if it's shown, else today, else the last date.
  const defaultIndex = () => {
    const selected = selectedDate ? indexByDate.get(selectedDate) : undefined;
    if (selected !== undefined) return selected;
    return indexByDate.get(activity.today) ?? activity.days.length - 1;
  };
  const [focusIndex, setFocusIndex] = useState(defaultIndex);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const cellRefs = useRef(new Map<number, HTMLTableCellElement>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // A new period starts at its default date, with the newest dates in view.
  const [shownPeriod, setShownPeriod] = useState(activity.period);
  if (shownPeriod !== activity.period) {
    setShownPeriod(activity.period);
    setFocusIndex(defaultIndex());
    setDetailIndex(null);
  }
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, [activity.period]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const cell = cellRefs.current.get(focusIndex);
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusIndex]);

  const move = (index: number) => {
    const next = Math.min(Math.max(index, 0), activity.days.length - 1);
    moved.current = true;
    setFocusIndex(next);
    setDetailIndex(next);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 7,
      ArrowRight: index + 7,
      Home: 0,
      End: activity.days.length - 1,
    };
    const target = keys[event.key];
    if (target !== undefined) {
      event.preventDefault();
      move(target);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(index);
    }
  };

  const pick = (index: number) => {
    const day = activity.days[index];
    if (!day?.available) return;
    onSelectDate(selectedDate === day.date ? null : day.date);
  };

  const detailDay = activity.days[detailIndex ?? focusIndex];
  const todayIndex = indexByDate.get(activity.today);
  const periodText = activity.period === "rolling" ? "in the last 365 days" : `in ${activity.label}`;
  const legendId = "activity-legend";

  return (
    <section className={`card ${styles.tracker}`} aria-labelledby="activity-heading" data-testid="activity">
      <div className={styles.head}>
        <div>
          <h2 id="activity-heading" className="section-title">
            Activity
          </h2>
          <p className={styles.note}>
            Every graded answer you submit counts, right or wrong. Days are UTC dates.
          </p>
        </div>
        <label className={styles.period}>
          <span className="field-label">Period</span>
          <select
            className="select"
            // The picker names what's shown, except while another period loads. After a failed
            // load it falls back to the shown period, and the error says which one failed.
            value={loading ? requested : activity.period}
            onChange={(event) => onPeriodChange(event.target.value as ActivityPeriodKey)}
            data-testid="activity-period"
          >
            <option value="rolling">Last 365 days</option>
            {[...activity.years].reverse().map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className={styles.stats} data-testid="streaks">
        <div>
          <dt>Current streak</dt>
          <dd data-testid="streak-current">
            <strong className="tabular">{formatNumber(streaks.current)}</strong>{" "}
            {streaks.current === 1 ? "day" : "days"}
          </dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd data-testid="streak-longest">
            <strong className="tabular">{formatNumber(streaks.longest)}</strong>{" "}
            {streaks.longest === 1 ? "day" : "days"}
          </dd>
        </div>
        <div>
          <dt>Active days</dt>
          <dd data-testid="activity-active-days">
            <strong className="tabular">{formatNumber(activity.activeDays)}</strong> {periodText}
          </dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd data-testid="streak-today">
            <strong className="tabular">{formatNumber(streaks.submissionsToday)}</strong>{" "}
            {streaks.submissionsToday === 1 ? "submission" : "submissions"}
            <span className={styles.todayStatus}>
              {streaks.submissionsToday > 0 ? "Practiced today" : "No submissions today"}
            </span>
          </dd>
        </div>
      </dl>
      <p className={styles.streakNote}>
        Streaks count consecutive UTC dates with at least one submission, across your whole history. If today has none
        yet, a streak that reached yesterday still counts.
      </p>

      {error ? (
        <div className="notice notice-error" role="alert" data-testid="activity-error">
          {error}{" "}
          <button type="button" className="btn btn-small" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}

      <p className={styles.summary} data-testid="activity-summary" aria-live="polite">
        {activity.label}: {plural(activity.submissions, "submission", "submissions")},{" "}
        <time dateTime={activity.start}>{formatDay(activity.start)}</time> to <time dateTime={activity.end}>{formatDay(activity.end)}</time>.
      </p>

      <div
        ref={scrollRef}
        className={styles.scroll}
        data-loading={loading ? "true" : undefined}
        aria-busy={loading}
        data-testid="activity-scroll"
      >
        <table
          role="grid"
          className={styles.grid}
          aria-label={`Daily submissions, ${activity.label}`}
          aria-describedby={legendId}
          data-testid="activity-grid"
          onMouseLeave={() => setDetailIndex(null)}
        >
          <thead aria-hidden="true">
            <tr>
              <td className={styles.corner} />
              {weeks.map((_, week) => (
                <td key={week} className={styles.month}>
                  <span>{months.find((month) => month.week === week)?.label ?? ""}</span>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((weekday, row) => (
              <tr key={weekday}>
                <th scope="row" className={styles.weekday}>
                  <span aria-hidden="true">{row % 2 === 1 ? weekday : ""}</span>
                  <span className="visually-hidden">{WEEKDAY_NAMES[row]}</span>
                </th>
                {weeks.map((week, column) => {
                  const day = week[row];
                  if (!day) return <td key={column} className={styles.pad} aria-hidden="true" />;
                  const index = indexByDate.get(day.date) ?? 0;
                  return (
                    <td
                      key={day.date}
                      ref={(element) => {
                        if (element) cellRefs.current.set(index, element);
                        else cellRefs.current.delete(index);
                      }}
                      role="gridcell"
                      tabIndex={index === focusIndex ? 0 : -1}
                      className={styles.cell}
                      data-level={day.available ? activityLevel(day.submissions) : undefined}
                      data-state={day.available ? undefined : "unavailable"}
                      data-today={index === todayIndex ? "true" : undefined}
                      data-date={day.date}
                      aria-label={describeDay(day, activity.today)}
                      aria-selected={day.date === selectedDate}
                      aria-disabled={day.available ? undefined : true}
                      onKeyDown={(event) => onKeyDown(event, index)}
                      onFocus={() => {
                        setFocusIndex(index);
                        setDetailIndex(index);
                      }}
                      onMouseEnter={() => setDetailIndex(index)}
                      onClick={() => {
                        setFocusIndex(index);
                        setDetailIndex(index);
                        pick(index);
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <p className={styles.detail} data-testid="activity-detail">
          {detailDay ? describeDay(detailDay, activity.today) : ""}
          {detailDay?.available ? <span className={styles.detailHint}> Press Enter or tap to filter history to this date.</span> : null}
        </p>
        <div className={styles.legend} id={legendId}>
          <span aria-hidden="true">Less</span>
          <ul>
            {ACTIVITY_LEVELS.map(({ level, label }) => (
              <li key={level} title={label}>
                <span className={styles.cell} data-level={level} aria-hidden="true" />
                <span className="visually-hidden">{label}</span>
              </li>
            ))}
          </ul>
          <span aria-hidden="true">More</span>
          <span className={styles.legendNote}>
            <span className={styles.cell} data-today="true" data-level={0} aria-hidden="true" /> Today
            <span className={styles.cell} data-state="unavailable" aria-hidden="true" /> No record
          </span>
        </div>
      </div>

      {selectedDate ? (
        <p className={styles.selected} data-testid="activity-selected">
          Showing <strong>{formatLongDay(selectedDate)}</strong> in Recent submissions below.{" "}
          <a href="#history">Go to submissions</a>{" "}
          <button type="button" className="btn btn-small btn-quiet" onClick={() => onSelectDate(null)}>
            Clear date
          </button>
        </p>
      ) : null}

      <details className={styles.table}>
        <summary>Show active days as a table</summary>
        <ActiveDaysTable activity={activity} />
      </details>
    </section>
  );
}

function ActiveDaysTable({ activity }: { activity: ProfileActivity }) {
  const active = activity.days.filter((day) => day.submissions > 0);
  if (active.length === 0) return <p className={styles.note}>No submissions in this period.</p>;
  return (
    <table data-testid="activity-table">
      <caption className="visually-hidden">Days with submissions, {activity.label}, newest first, in UTC</caption>
      <thead>
        <tr>
          <th scope="col">Date (UTC)</th>
          <th scope="col">Submissions</th>
          <th scope="col">Correct</th>
        </tr>
      </thead>
      <tbody>
        {[...active].reverse().map((day) => (
          <tr key={day.date}>
            <th scope="row">
              <time dateTime={day.date}>{formatLongDay(day.date)}</time>
            </th>
            <td className="tabular">{day.submissions}</td>
            <td className="tabular">{day.passed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
