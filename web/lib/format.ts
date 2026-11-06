// Dates and numbers for display. The site is in US English, so every formatter names "en-US"
// rather than using the browser's or server's locale. Dates are shown in UTC, the zone the
// profile's activity view groups days by (lib/server/profile.ts), so a date reads the same in the
// server's HTML and in the browser.

export const LOCALE = "en-US";
export const DISPLAY_TIME_ZONE = "UTC";

const NUMBER = new Intl.NumberFormat(LOCALE);
const DATE = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});
const DAY = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: DISPLAY_TIME_ZONE });
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
  timeZoneName: "short",
});

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** "1 attempt", "2 attempts". */
export function plural(count: number, one: string, many: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/** "Nov 6, 2026", from an ISO timestamp. */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** "Nov 6, 2026, 3:04 PM UTC", from an ISO timestamp. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** A YYYY-MM-DD calendar date as midnight UTC. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** "Fri, Nov 6, 2026", from a YYYY-MM-DD calendar date. */
export function formatDay(day: string): string {
  return DAY.format(dayToDate(day));
}

/** "Nov", from a YYYY-MM-DD calendar date. */
export function formatMonth(day: string): string {
  return MONTH.format(dayToDate(day));
}
