// Challenge and leaderboard periods, in UTC. A daily period starts at 00:00 UTC, a weekly one on
// Monday at 00:00 UTC, a monthly one on the 1st at 00:00 UTC. The server's clock decides which
// period is open; the browser only formats what the server sends. Plain UTC arithmetic, so no
// time zone or daylight saving change can move a boundary.

import { LOCALE } from "@/lib/format";

export const PERIOD_KINDS = ["daily", "weekly", "monthly"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const LEADERBOARD_PERIODS = ["all", "daily", "weekly", "monthly"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

const DAY_MS = 86_400_000;

function isoDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** The YYYY-MM-DD date the period containing `now` starts on. */
export function periodStart(kind: PeriodKind, now: Date): string {
  const today = parseDay(isoDate(now));
  switch (kind) {
    case "daily":
      return isoDate(today);
    case "weekly": {
      // getUTCDay: Sunday is 0. Monday-based weeks go back 6 days from Sunday.
      const sinceMonday = (today.getUTCDay() + 6) % 7;
      return isoDate(new Date(today.getTime() - sinceMonday * DAY_MS));
    }
    case "monthly":
      return `${isoDate(today).slice(0, 7)}-01`;
  }
}

/** The YYYY-MM-DD date the period after the one starting on `start` begins. */
export function nextPeriodStart(kind: PeriodKind, start: string): string {
  const date = parseDay(start);
  switch (kind) {
    case "daily":
      return isoDate(new Date(date.getTime() + DAY_MS));
    case "weekly":
      return isoDate(new Date(date.getTime() + 7 * DAY_MS));
    case "monthly":
      return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
  }
}

/** The YYYY-MM-DD date the period before the one starting on `start` begins. */
export function previousPeriodStart(kind: PeriodKind, start: string): string {
  const date = parseDay(start);
  switch (kind) {
    case "daily":
      return isoDate(new Date(date.getTime() - DAY_MS));
    case "weekly":
      return isoDate(new Date(date.getTime() - 7 * DAY_MS));
    case "monthly":
      return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
  }
}

/** Whether `day` can start a period of this kind. */
export function isPeriodStart(kind: PeriodKind, day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isoDate(parseDay(day)) !== day) return false;
  return periodStart(kind, parseDay(day)) === day;
}

export interface PeriodRange {
  kind: PeriodKind;
  /** YYYY-MM-DD. */
  start: string;
  /** ISO timestamp of the first moment of the period, 00:00 UTC. */
  startsAt: string;
  /** ISO timestamp of the first moment after the period, 00:00 UTC. */
  endsAt: string;
}

export function periodRange(kind: PeriodKind, start: string): PeriodRange {
  return {
    kind,
    start,
    startsAt: parseDay(start).toISOString(),
    endsAt: parseDay(nextPeriodStart(kind, start)).toISOString(),
  };
}

export function currentPeriod(kind: PeriodKind, now: Date): PeriodRange {
  return periodRange(kind, periodStart(kind, now));
}

/** The leaderboard's bounds: null for all time. */
export function leaderboardRange(period: LeaderboardPeriod, now: Date): PeriodRange | null {
  return period === "all" ? null : currentPeriod(period, now);
}

const LONG_DAY = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const MONTH_DAY = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "long", day: "numeric" });
const MONTH_YEAR = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "long", year: "numeric" });

/** "Wednesday, November 11, 2026", "Week of November 9, 2026", "November 2026". */
export function describePeriod(kind: PeriodKind, start: string): string {
  const date = parseDay(start);
  switch (kind) {
    case "daily":
      return LONG_DAY.format(date);
    case "weekly":
      return `Week of ${MONTH_DAY.format(date)}, ${date.getUTCFullYear()}`;
    case "monthly":
      return MONTH_YEAR.format(date);
  }
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  all: "All time",
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};

/** "5h 12m", "2d 3h", "45m", "under a minute": time left until `endsAt`, from the server's `now`. */
export function formatTimeLeft(endsAt: string, now: Date): string {
  const ms = Date.parse(endsAt) - now.getTime();
  if (ms <= 0) return "ended";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
