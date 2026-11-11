// Words shared by the challenge cards, the archive and the puzzle list's strip. Browser-safe.

import type { ChallengeCard, PeriodKind } from "@/lib/api-types";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { formatDay } from "@/lib/format";
import { PERIOD_LABELS } from "@/lib/periods";

/** "Daily challenge". */
export function challengeName(kind: PeriodKind): string {
  return `${PERIOD_LABELS[kind]} challenge`;
}

/** When each kind rotates, in UTC. */
export const ROTATION: Record<PeriodKind, string> = {
  daily: "Rotates every day at 00:00 UTC",
  weekly: "Rotates every Monday at 00:00 UTC",
  monthly: "Rotates on the 1st at 00:00 UTC",
};

/** The span each kind is open for, for sentences such as "Solve it during its day". */
export const PERIOD_NOUNS: Record<PeriodKind, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

/** Titles of the achievements a challenge of this kind counts toward. */
export function relatedAchievements(kind: PeriodKind): string[] {
  return ACHIEVEMENTS.filter((achievement) => {
    if (achievement.retired) return false;
    const { metric } = achievement;
    if (metric.kind === "challenges") return metric.period === kind;
    return metric.kind === "challenge-streak" && kind === "daily";
  }).map((achievement) => achievement.title);
}

/** "A", "A and B", "A, B and C". */
export function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export type ChallengeState = "completed" | "solved-elsewhere" | "attempted" | "not-started";

/** Where the signed-in user stands on one challenge period. */
export function challengeState(card: ChallengeCard): ChallengeState {
  if (card.completed) return "completed";
  if (card.status === "solved") return "solved-elsewhere";
  if (card.status === "attempted") return "attempted";
  return "not-started";
}

/** A period's short name for a list: "Wed, Nov 11, 2026", "Week of November 9, 2026", "November 2026". */
export function shortPeriodLabel(card: ChallengeCard): string {
  return card.kind === "daily" ? formatDay(card.periodStart) : card.label;
}
