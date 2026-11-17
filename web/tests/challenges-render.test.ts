import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChallengesError from "@/app/(app)/challenges/error";
import ChallengesLoading from "@/app/(app)/challenges/loading";
import { ArchiveList } from "@/components/challenges/ArchiveList";
import { ChallengeBar } from "@/components/challenges/ChallengeBar";
import { ChallengeStreakPanel } from "@/components/challenges/ChallengeStreakPanel";
import { challengeState, listInWords, relatedAchievements } from "@/components/challenges/copy";
import { HowChallengesWork } from "@/components/challenges/HowChallengesWork";
import { TodayStrip } from "@/components/challenges/TodayStrip";
import { Achievements, AchievementsUnavailable } from "@/components/profile/Achievements";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { AchievementStatus, ChallengeCard } from "@/lib/api-types";
import { streakCalendar, streakScale } from "@/lib/streak-display";

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

describe("challenge bars", () => {
  it("holds the type, the countdown from the server's clock, the points and one button", () => {
    const markup = html(createElement(ChallengeBar, { card: card(), now: NOW, signedIn: false }));
    expect(markup).toContain('data-testid="challenge-daily"');
    expect(markup).toContain("Daily");
    expect(markup).toContain("Ends in");
    // 00:00 UTC on the 12th, from 15:48 UTC on the 11th.
    expect(markup).toContain("8h 12m");
    // A non-breaking space keeps the points on one line.
    expect(markup).toContain("+50 pts");
    expect(markup.match(/href="\/puzzles\/demo-find-001"/g)).toHaveLength(1);
    expect(markup).toMatch(/data-testid="challenge-puzzle"[^>]*>Start</);
    expect(markup).toContain("btn-primary");
    expect(markup).toContain('data-icon="arrow-right"');
    // Dropped from the bar: the puzzle's title, chips and repository, the rotation and the notes.
    for (const dropped of ["Where limits live", "demo-repo", "Rotates", "Counts toward", "your time"]) {
      expect(markup).not.toContain(dropped);
    }
    expect(markup).not.toContain('data-testid="challenge-state"');
  });

  it("words the button by where the signed-in user stands", () => {
    const bar = (overrides: Partial<ChallengeCard>, signedIn = true) =>
      html(createElement(ChallengeBar, { card: card(overrides), now: NOW, signedIn }));
    expect(bar({})).toMatch(/data-state="not-started"[^>]*>Start</);
    expect(bar({ status: "attempted" })).toMatch(/data-state="attempted"[^>]*>Continue</);
    const completed = bar({ completed: true, completedAt: "2026-11-11T14:00:00.000Z", status: "solved" });
    expect(completed).toContain('data-completed="true"');
    expect(completed).toMatch(/data-state="completed"[^>]*><svg[^>]*data-icon="check"/);
    expect(completed).toContain("Completed");
    expect(completed).not.toContain("btn-primary");
    // Solved before the period began: nothing left to start, and the bar isn't marked completed.
    const before = bar({ status: "solved" });
    expect(before).toContain('data-completed="false"');
    expect(before).toContain('data-state="solved-elsewhere"');
    expect(before).toContain("Solved");
    expect(before).not.toContain("Completed");
    // Signed out, whatever the row says, the button offers a start.
    expect(bar({ status: "attempted" }, false)).toMatch(/data-testid="challenge-puzzle"[^>]*>Start</);
  });

  it("says a withdrawn puzzle is withdrawn, with no link or button", () => {
    const markup = html(createElement(ChallengeBar, { card: card({ puzzle: null }), now: NOW, signedIn: true }));
    expect(markup).toMatch(/data-testid="challenge-withdrawn"[^>]*>Withdrawn</);
    expect(markup).not.toContain("/puzzles/");
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain('data-testid="challenge-puzzle"');
    expect(markup).toContain("8h 12m");
  });

  it("shows an ended period with a way to load the next one", () => {
    const markup = html(createElement(ChallengeBar, { card: card(), now: "2026-11-12T00:00:30.000Z", signedIn: false }));
    expect(markup).toContain('data-ended="true"');
    expect(markup).toContain("Show the new challenge");
  });

  it("names the achievements each kind counts toward", () => {
    expect(relatedAchievements("weekly")).toEqual(["Weekly Regular"]);
    expect(listInWords(relatedAchievements("monthly"))).toBe("Monthly Milestone and Quarter Climber");
    expect(challengeState(card({ status: "attempted" }))).toBe("attempted");
  });
});

describe("how challenges work", () => {
  it("is a closed disclosure holding the rules, each rotation in UTC and the streak rule", () => {
    const markup = html(
      createElement(HowChallengesWork, {
        rotations: [
          { kind: "daily", endsAt: "2026-11-12T00:00:00.000Z" },
          { kind: "weekly", endsAt: "2026-11-16T00:00:00.000Z" },
          { kind: "monthly", endsAt: "2026-12-01T00:00:00.000Z" },
        ],
      }),
    );
    expect(markup).toMatch(/^<details(?![^>]*\sopen)/);
    expect(markup).toContain("<summary");
    expect(markup).toContain("How challenges work");
    expect(markup.match(/data-testid="challenge-rotation"/g)).toHaveLength(3);
    for (const rotation of ["Rotates every day at 00:00 UTC", "Rotates every Monday at 00:00 UTC", "Rotates on the 1st at 00:00 UTC"]) {
      expect(markup).toContain(rotation);
    }
    // The local time only appears in the browser.
    expect(markup).not.toContain("your time");
    expect(markup).toContain("Complete the daily challenge on its UTC day to keep your streak.");
    expect(markup).toContain("Weekly and monthly challenges are tracked separately");
  });
});

describe("streak display", () => {
  it("ends the scale at the longest streak, never below 7, or at the next milestone", () => {
    expect(streakScale(0, 0)).toEqual({ max: 7, nextLabel: "Next: 7 days" });
    expect(streakScale(3, 10)).toEqual({ max: 10, nextLabel: null });
    expect(streakScale(7, 7)).toEqual({ max: 14, nextLabel: "Next: 14 days" });
    expect(streakScale(400, 400)).toEqual({ max: 400, nextLabel: null });
    expect(streakScale(2, 5)).toEqual({ max: 7, nextLabel: null });
    expect(streakScale(364, 364)).toEqual({ max: 365, nextLabel: "Next: 365 days" });
    expect(streakScale(365, 365)).toEqual({ max: 365, nextLabel: null });
  });

  it("lays out five weeks from a Monday, ending with today's week, in UTC days", () => {
    // 2026-11-11 is a Wednesday.
    const cells = streakCalendar("2026-11-11", ["2026-11-10", "2026-11-11", "2026-10-12", "2026-09-01"]);
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ day: "2026-10-12", state: "completed", today: false });
    expect(cells[1]).toEqual({ day: "2026-10-13", state: "missed", today: false });
    expect(cells[29]).toEqual({ day: "2026-11-10", state: "completed", today: false });
    expect(cells[30]).toEqual({ day: "2026-11-11", state: "completed", today: true });
    expect(cells[31]).toEqual({ day: "2026-11-12", state: "future", today: false });
    expect(cells[34]).toEqual({ day: "2026-11-15", state: "future", today: false });
    // Today not done yet is open, not missed.
    expect(streakCalendar("2026-11-11", [])[30]).toEqual({ day: "2026-11-11", state: "open", today: true });
    // A Sunday ends its own week; a Monday starts the last row.
    expect(streakCalendar("2026-11-15", []).at(-1)?.day).toBe("2026-11-15");
    expect(streakCalendar("2026-11-16", [])[28]?.day).toBe("2026-11-16");
    expect(streakCalendar("2027-01-01", [])[0]?.day).toBe("2026-11-30");
  });
});

describe("challenge streak and archive", () => {
  const panel = (current: number, longest: number, completedToday: boolean, recentDays: string[]) =>
    html(
      createElement(ChallengeStreakPanel, {
        streak: { current, longest, completedToday, recentDays },
        completedCounts: { daily: 9, weekly: 2, monthly: 1 },
        now: NOW,
      }),
    );

  it("gives the streak as a number, a bar, a calendar and the counts, with no paragraph", () => {
    const markup = panel(1, 4, false, ["2026-11-10"]);
    expect(markup).toContain("Daily streak");
    expect(markup).toMatch(/data-testid="challenge-streak-current"[^>]*>.*1.*day/);
    expect(markup).toContain("Not completed yet");
    expect(markup).toMatch(/role="progressbar"/);
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="7"');
    expect(markup).toContain('aria-valuenow="1"');
    expect(markup).toContain('aria-valuetext="1 of 7 days"');
    expect(markup).toMatch(/data-testid="challenge-streak-longest"[^>]*>4</);
    expect(markup).toMatch(/data-testid="challenge-count-daily"[^>]*>9</);
    expect(markup).toMatch(/data-testid="challenge-count-weekly"[^>]*>2</);
    expect(markup).toMatch(/data-testid="challenge-count-monthly"[^>]*>1</);
    for (const label of ["Current", "Longest", "Daily completed", "Weekly completed", "Monthly completed"]) {
      expect(markup).toContain(label);
    }
    // The rule lives in the disclosure now.
    expect(markup).not.toContain("to keep your streak");
    expect(markup).not.toMatch(/<p[\s>]/);
  });

  it("draws the last five weeks from the server's UTC date, each day labeled", () => {
    const markup = panel(2, 2, true, ["2026-11-10", "2026-11-11"]);
    expect(markup.match(/data-day="/g)).toHaveLength(35);
    expect(markup).toMatch(/data-day="2026-11-10" data-state="completed"/);
    expect(markup).toMatch(/data-day="2026-11-11" data-state="completed" data-today="true"/);
    expect(markup).toMatch(/data-day="2026-11-12" data-state="future"/);
    expect(markup).toContain("Tue, Nov 10, 2026: completed");
    expect(markup).toContain("Wed, Nov 11, 2026, today: completed");
    expect(markup).toContain("Thu, Nov 12, 2026: upcoming");
    expect(markup).toContain("Mon, Oct 12, 2026: not completed");
    expect(markup).toContain("Completed today");
    expect(markup).toContain("Next: 7 days");
  });

  it("keeps the bar and its label sensible at 0, 7 and 400 days", () => {
    const zero = panel(0, 0, false, []);
    expect(zero).toContain('aria-valuemax="7"');
    expect(zero).toContain('aria-valuenow="0"');
    expect(zero).toContain("--streak-fill:0%");
    expect(zero).toContain("Next: 7 days");
    // Only an empty streak gets the prompt to start one.
    expect(zero).toContain("Complete today&#x27;s daily challenge to start a streak.");
    expect(panel(1, 1, true, [])).not.toContain("to start a streak");
    const seven = panel(7, 7, true, []);
    expect(seven).toContain('aria-valuemax="14"');
    expect(seven).toContain("--streak-fill:50%");
    expect(seven).toContain("Next: 14 days");
    const many = panel(400, 400, true, []);
    expect(many).toContain('aria-valuemax="400"');
    expect(many).toContain('aria-valuetext="400 of 400 days"');
    expect(many).toContain("--streak-fill:100%");
    expect(many).not.toContain("Next:");
    // Behind the longest: the scale is the longest, and the label names it.
    const behind = panel(3, 10, true, []);
    expect(behind).toContain('aria-valuemax="10"');
    expect(behind).toContain("--streak-fill:30%");
    expect(behind).toContain("Longest: 10 days");
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
