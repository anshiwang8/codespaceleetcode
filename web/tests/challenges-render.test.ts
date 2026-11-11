import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChallengesError from "@/app/(app)/challenges/error";
import ChallengesLoading from "@/app/(app)/challenges/loading";
import { ArchiveList } from "@/components/challenges/ArchiveList";
import { ChallengeCardView } from "@/components/challenges/ChallengeCardView";
import { ChallengeStreakPanel } from "@/components/challenges/ChallengeStreakPanel";
import { challengeState, listInWords, relatedAchievements } from "@/components/challenges/copy";
import { TodayStrip } from "@/components/challenges/TodayStrip";
import { Achievements, AchievementsUnavailable } from "@/components/profile/Achievements";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { AchievementStatus, ChallengeCard } from "@/lib/api-types";

// The challenge pages' and the profile's achievement states rendered to HTML, the way the server
// sends them.

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

const NOW = "2026-11-11T15:48:00.000Z";

function card(overrides: Partial<ChallengeCard> = {}): ChallengeCard {
  return {
    kind: "daily",
    periodStart: "2026-11-11",
    label: "Wednesday, November 11, 2026",
    startsAt: "2026-11-11T00:00:00.000Z",
    endsAt: "2026-11-12T00:00:00.000Z",
    puzzle: { slug: "demo-find-001", title: "Where limits live", type: "find", difficulty: "easy", repoSlug: "demo-repo" },
    bonus: 50,
    completed: false,
    completedAt: null,
    status: "unsolved",
    ...overrides,
  };
}

describe("challenge cards", () => {
  it("counts down from the server's clock and gives the rotation in UTC", () => {
    const markup = html(createElement(ChallengeCardView, { card: card(), now: NOW, signedIn: false }));
    expect(markup).toContain("Daily challenge");
    expect(markup).toContain("Wednesday, November 11, 2026");
    expect(markup).toContain('href="/puzzles/demo-find-001"');
    expect(markup).toContain("+50 bonus points");
    // 00:00 UTC on the 12th, from 15:48 UTC on the 11th.
    expect(markup).toContain("8h 12m");
    expect(markup).toContain("Rotates every day at 00:00 UTC");
    // The local time only appears in the browser.
    expect(markup).not.toContain("your time");
    expect(markup).toContain("Counts toward Daily Debut and Week of Dailies.");
    // Signed out, there's no state to show.
    expect(markup).not.toContain('data-testid="challenge-state"');
  });

  it("says when a signed-in user completed it, in words and with an icon", () => {
    const markup = html(
      createElement(ChallengeCardView, {
        card: card({ completed: true, completedAt: "2026-11-11T14:00:00.000Z", status: "solved" }),
        now: NOW,
        signedIn: true,
      }),
    );
    expect(markup).toContain('data-state="completed"');
    expect(markup).toContain('data-icon="status-solved"');
    expect(markup).toContain("Completed Nov 11, 2026, 2:00 PM UTC.");
    expect(markup).toContain("Open puzzle");
  });

  it("tells a user who solved the puzzle earlier that it doesn't count this time", () => {
    const markup = html(createElement(ChallengeCardView, { card: card({ status: "solved" }), now: NOW, signedIn: true }));
    expect(markup).toContain('data-state="solved-elsewhere"');
    expect(markup).toContain("You solved this puzzle before this day began, so it doesn&#x27;t count toward this challenge.");
    expect(markup).not.toContain("Solve again");
  });

  it("explains a withdrawn puzzle instead of linking to it", () => {
    const markup = html(createElement(ChallengeCardView, { card: card({ puzzle: null }), now: NOW, signedIn: true }));
    expect(markup).toContain("has been withdrawn");
    expect(markup).not.toContain("/puzzles/");
  });

  it("shows an ended period with a way to load the next one", () => {
    const markup = html(createElement(ChallengeCardView, { card: card(), now: "2026-11-12T00:00:30.000Z", signedIn: false }));
    expect(markup).toContain('data-ended="true"');
    expect(markup).toContain("Show the new challenge");
  });

  it("names the achievements each kind counts toward", () => {
    expect(relatedAchievements("weekly")).toEqual(["Weekly Regular"]);
    expect(listInWords(relatedAchievements("monthly"))).toBe("Monthly Milestone and Quarter Climber");
    expect(challengeState(card({ status: "attempted" }))).toBe("attempted");
  });
});

describe("challenge streak and archive", () => {
  it("gives the streak, today, and the other kinds' counts", () => {
    const markup = html(
      createElement(ChallengeStreakPanel, {
        streak: { current: 1, longest: 4, completedToday: false },
        completedCounts: { daily: 9, weekly: 2, monthly: 1 },
      }),
    );
    expect(markup).toContain("1 day");
    expect(markup).toContain("4 days");
    expect(markup).toContain("Not completed yet");
    expect(markup).toContain("Complete the daily challenge on its UTC day to keep your streak.");
    expect(markup).toContain("Weekly and monthly challenges are tracked separately");
  });

  it("words each past period's result, and leaves results out when signed out", () => {
    const items = [
      card({ periodStart: "2026-11-10", completed: true, status: "solved" }),
      card({ periodStart: "2026-11-09", status: "solved" }),
      card({ periodStart: "2026-11-08", status: "attempted" }),
      card({ periodStart: "2026-11-07" }),
    ];
    const signedIn = html(createElement(ArchiveList, { items, signedIn: true }));
    for (const words of ["Completed on time", "Solved, not on time", "Attempted", "Not attempted"]) {
      expect(signedIn).toContain(words);
    }
    expect(signedIn).toContain("Tue, Nov 10, 2026");
    const signedOut = html(createElement(ArchiveList, { items, signedIn: false }));
    expect(signedOut).not.toContain('data-testid="challenge-state"');
  });

  it("the puzzle list strip is one line, and absent without a puzzle", () => {
    const markup = html(createElement(TodayStrip, { card: card(), now: NOW, signedIn: true }));
    expect(markup).toContain("Today&#x27;s challenge");
    expect(markup).toContain("Ends in ");
    expect(markup).toContain('href="/challenges"');
    expect(html(createElement(TodayStrip, { card: card({ puzzle: null }), now: NOW, signedIn: true }))).toBe("");
  });

  it("loading and errors say what's happening, with no developer instructions", () => {
    expect(html(createElement(ChallengesLoading))).toContain("Loading challenges");
    const markup = html(createElement(ChallengesError, { error: new Error("connect ECONNREFUSED"), reset: () => {} }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Try again");
    for (const developerText of ["ECONNREFUSED", "pnpm", "database"]) expect(markup).not.toContain(developerText);
  });
});

describe("achievements on the profile", () => {
  const statuses: AchievementStatus[] = ACHIEVEMENTS.filter((a) => !a.retired).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.category,
    icon: a.icon,
    threshold: typeof a.threshold === "number" ? a.threshold : 4,
    progress: a.id === "first-steps" ? 1 : a.id === "getting-comfortable" ? 3 : 0,
    unlockedAt: a.id === "first-steps" ? "2026-11-06T23:30:00.000Z" : null,
  }));

  it("summarizes, groups by category, and marks earned and locked in words", () => {
    const markup = html(createElement(Achievements, { achievements: statuses }));
    expect(markup).toContain('id="achievements"');
    expect(markup).toContain(`1 of ${statuses.length} earned`);
    for (const label of ["Getting started", "Difficulty", "Consistency", "Mastery", "Challenges"]) {
      expect(markup).toContain(label);
    }
    // Dated in UTC, so it's the same day everywhere.
    expect(markup).toContain("Earned <time");
    expect(markup).toContain("Nov 6, 2026");
    expect(markup).toContain("Locked");
    expect(markup).toContain('aria-valuetext="3 of 5"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("a failure to load says so without hiding the rest of the profile", () => {
    const markup = html(createElement(AchievementsUnavailable));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Reload the page");
  });
});
