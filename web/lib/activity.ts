import type { ActivityDay } from "@/lib/api-types";
import { dayToDate, formatLongDay, formatMonth, plural } from "@/lib/format";

// How the activity calendar is laid out and described. Pure, so the tests and the component share it.

/**
 * Intensity steps by submissions on a date: 0, 1, 2–3, 4–6, 7 or more. Fixed, so a shade means
 * the same thing in every period and for every user.
 */
export const ACTIVITY_LEVELS = [
  { level: 0, label: "No submissions" },
  { level: 1, label: "1 submission" },
  { level: 2, label: "2–3 submissions" },
  { level: 3, label: "4–6 submissions" },
  { level: 4, label: "7 or more submissions" },
] as const;

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export function activityLevel(submissions: number): ActivityLevel {
  if (submissions <= 0) return 0;
  if (submissions === 1) return 1;
  if (submissions <= 3) return 2;
  if (submissions <= 6) return 3;
  return 4;
}

/** A week column: seven slots, Sunday first. Null slots are padding outside the period. */
export type CalendarWeek = (ActivityDay | null)[];

export interface CalendarLayout {
  weeks: CalendarWeek[];
  /** A month name over the column where it starts. Columns without a label are left out. */
  months: { week: number; label: string }[];
}

/**
 * Lays the period's dates out as week columns, Sunday at the top, oldest first. Padding before
 * the first date and after the last keeps each date on its weekday row; it isn't a date.
 */
export function calendarLayout(days: ActivityDay[]): CalendarLayout {
  const first = days[0];
  if (!first) return { weeks: [], months: [] };
  const lead = dayToDate(first.date).getUTCDay();
  const slots: (ActivityDay | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (slots.length % 7 !== 0) slots.push(null);
  const weeks: CalendarWeek[] = [];
  for (let index = 0; index < slots.length; index += 7) weeks.push(slots.slice(index, index + 7));

  // A month is named over the first column that holds its 1st. The first column is named for its
  // own month too, unless a new month starts within two columns, where the names would collide.
  const starts = weeks.flatMap((week, index) => {
    const firstOfMonth = week.find((day) => day?.date.endsWith("-01"));
    return firstOfMonth ? [{ week: index, label: formatMonth(firstOfMonth.date) }] : [];
  });
  const months = [...starts];
  if (starts[0]?.week !== 0 && !(starts[0] && starts[0].week <= 2)) {
    months.unshift({ week: 0, label: formatMonth(first.date) });
  }
  return { weeks, months };
}

/** "November 6, 2026: 3 submissions, 1 correct." The wording a cell, its detail line and its label use. */
export function describeDay(day: ActivityDay, today: string): string {
  const date = formatLongDay(day.date);
  if (!day.available) {
    return day.date > today ? `${date}: in the future.` : `${date}: before your history starts.`;
  }
  const when = day.date === today ? " (today)" : "";
  if (day.submissions === 0) return `${date}${when}: no submissions.`;
  return `${date}${when}: ${plural(day.submissions, "submission", "submissions")}, ${day.passed} correct.`;
}
