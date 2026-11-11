// URLs and wording for /leaderboard. The period and page live in the URL, with the defaults (all
// time, page 1) left out so the plain board stays at /leaderboard.

import { LEADERBOARD_PERIODS, type LeaderboardPeriod } from "@/lib/periods";

export const LEADERBOARD_PATH = "/leaderboard";
/** Where Settings' leaderboard visibility section is. */
export const VISIBILITY_SETTINGS_HREF = "/settings#leaderboard";

export function leaderboardHref(period: LeaderboardPeriod, page = 1): string {
  const params = new URLSearchParams();
  if (period !== "all") params.set("period", period);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${LEADERBOARD_PATH}?${query}` : LEADERBOARD_PATH;
}

/** A bad or repeated value is ignored rather than failing the page. */
export function parsePeriod(value: string | string[] | undefined): LeaderboardPeriod {
  return LEADERBOARD_PERIODS.find((period) => period === value) ?? "all";
}

export function parsePage(value: string | string[] | undefined, maxPage: number): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Math.min(Number(value), maxPage);
}

/** "today", "this week", "this month", or "" for all time: read after a verb ("scored today"). */
export const PERIOD_PHRASES: Record<LeaderboardPeriod, string> = {
  all: "",
  daily: "today",
  weekly: "this week",
  monthly: "this month",
};

/** Page numbers to link, with null where a run is left out: 1 … 4 5 6 … 12. */
export function pageWindow(current: number, total: number): (number | null)[] {
  const wanted = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const pages = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous === 2) out.push(previous + 1);
    else if (previous !== undefined && page - previous > 2) out.push(null);
    out.push(page);
  });
  return out;
}
