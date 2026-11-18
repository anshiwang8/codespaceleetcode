// How the daily challenge streak is drawn on /challenges: the bar's scale and the five-week
// calendar. Browser-safe, and pure: "today" is always passed in, from the server's UTC date.

import { periodStart } from "@/lib/periods";

/** Where the bar's scale may end when the current streak is the longest. Display only, not achievements. */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 200, 365] as const;

const SHORTEST_SCALE = STREAK_MILESTONES[0];

export interface StreakScale {
  /** The streak length the full bar stands for. */
  max: number;
  /** "Next: 14 days" when the scale ends at a milestone still ahead, otherwise null. */
  nextLabel: string | null;
}

/**
 * The bar's scale. It ends at the longest streak, and never below 7. When the current streak is
 * the longest, it ends at the next milestone above it; past the last milestone it ends at the
 * streak itself.
 */
export function streakScale(current: number, longest: number): StreakScale {
  if (current < longest) return { max: Math.max(SHORTEST_SCALE, longest), nextLabel: null };
  const next = STREAK_MILESTONES.find((milestone) => milestone > current);
  if (next === undefined) return { max: Math.max(SHORTEST_SCALE, current), nextLabel: null };
  return { max: next, nextLabel: `Next: ${next} days` };
}

export const CALENDAR_WEEKS = 5;

export type StreakDayState = "completed" | "missed" | "open" | "future";

export interface StreakDay {
  /** A UTC date, YYYY-MM-DD. */
  day: string;
  /** `open` is today before it's completed; `missed` is a past day without a completion. */
  state: StreakDayState;
  today: boolean;
}

const DAY_MS = 86_400_000;

/**
 * The last five weeks as 35 UTC days, Monday first, the last row being the week `today` is in.
 * `today` is the server's UTC date, never the browser's.
 */
export function streakCalendar(today: string, completedDays: readonly string[]): StreakDay[] {
  const completed = new Set(completedDays);
  const monday = Date.parse(`${periodStart("weekly", new Date(`${today}T00:00:00Z`))}T00:00:00Z`);
  const first = monday - (CALENDAR_WEEKS - 1) * 7 * DAY_MS;
  return Array.from({ length: CALENDAR_WEEKS * 7 }, (_, index) => {
    const day = new Date(first + index * DAY_MS).toISOString().slice(0, 10);
    const isToday = day === today;
    const state: StreakDayState =
      day > today ? "future" : completed.has(day) ? "completed" : isToday ? "open" : "missed";
    return { day, state, today: isToday };
  });
}
