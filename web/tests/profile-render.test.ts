import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileError from "@/app/(app)/profile/error";
import ProfileLoading from "@/app/(app)/profile/loading";
import { ActivityTracker } from "@/components/profile/ActivityTracker";
import { ContinuePracticing } from "@/components/profile/ContinuePracticing";
import { IdentityCard } from "@/components/profile/IdentityCard";
import { ProgressBreakdown } from "@/components/profile/ProgressBreakdown";
import { cumulativeSolves, SolveChart } from "@/components/profile/SolveChart";
import { avatarTone, initials } from "@/components/site/Avatar";
import type { PracticeStreaks, ProfileIdentity, ProfileProgress } from "@/lib/api-types";
import { formatDate, formatDateTime, formatDay, plural } from "@/lib/format";
import { buildActivity, resolvePeriod } from "@/lib/server/profile";

// The profile's states rendered to HTML, the way the server sends them.

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

const emptyCount = { solved: 0, attempted: 0, total: 0 };
const progress: ProfileProgress = {
  solved: 3,
  attempted: 1,
  total: 10,
  completionPercent: 30,
  submissions: 12,
  byType: { find: emptyCount, trace: emptyCount, architecture: emptyCount },
  byDifficulty: { easy: emptyCount, medium: emptyCount, hard: emptyCount },
  byRepo: [],
  byTopic: [],
};

describe("profile states", () => {
  it("loading says so to assistive technology", () => {
    const markup = html(createElement(ProfileLoading));
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading your profile");
  });

  it("an error explains what to do, offers a retry, and shows no developer instructions", () => {
    const markup = html(createElement(ProfileError, { error: new Error("connect ECONNREFUSED"), reset: () => {} }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Try again");
    expect(markup).toContain('href="/puzzles"');
    for (const developerText of ["ECONNREFUSED", "pnpm", "uv run", "ingest", "database"]) {
      expect(markup).not.toContain(developerText);
    }
  });

  it("a dev account is labeled as local, with no GitHub link", () => {
    const identity: ProfileIdentity = {
      login: "dev-1a2b",
      displayName: null,
      provider: "dev",
      memberSince: "2026-11-02T23:30:00.000Z",
      githubUrl: null,
    };
    const markup = html(createElement(IdentityCard, { identity, progress }));
    expect(markup).toContain("Local development account");
    expect(markup).not.toContain("github.com");
    // Shown in UTC, so it's the same day on the server and in every browser.
    expect(markup).toContain("Member since <time");
    expect(markup).toContain("Nov 2, 2026");
    expect(markup).toContain("3 of 10 available puzzles solved");
  });

  it("a GitHub account links to its GitHub page and shows its display name", () => {
    const identity: ProfileIdentity = {
      login: "octocat",
      displayName: "The Octocat",
      provider: "github",
      memberSince: "2026-01-01T00:00:00.000Z",
      githubUrl: "https://github.com/octocat",
    };
    const markup = html(createElement(IdentityCard, { identity, progress }));
    expect(markup).toContain('href="https://github.com/octocat"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("(opens in a new tab)");
    expect(markup).toContain("The Octocat");
    expect(markup).toContain("GitHub account");
  });

  it("continue practicing has an empty state for each situation, each linking to the list", () => {
    const fresh = html(createElement(ContinuePracticing, { unfinished: [], hasSubmissions: false, allSolved: false }));
    expect(fresh).toContain("haven&#x27;t attempted a puzzle yet");
    expect(fresh).toContain('href="/puzzles"');
    const caughtUp = html(createElement(ContinuePracticing, { unfinished: [], hasSubmissions: true, allSolved: false }));
    expect(caughtUp).toContain("Every puzzle you&#x27;ve attempted is solved");
    const done = html(createElement(ContinuePracticing, { unfinished: [], hasSubmissions: true, allSolved: true }));
    expect(done).toContain("solved every available puzzle");
  });

  it("an unfinished puzzle links to the puzzle and says it opens fresh", () => {
    const markup = html(
      createElement(ContinuePracticing, {
        unfinished: [
          {
            slug: "fx-file",
            title: "Where limits live",
            type: "find",
            difficulty: "easy",
            repoSlug: "acme-router",
            attempts: 1,
            lastSubmittedAt: "2026-11-05T23:59:00.000Z",
          },
        ],
        hasSubmissions: true,
        allSolved: false,
      }),
    );
    expect(markup).toContain('href="/puzzles/fx-file"');
    expect(markup).toContain("1 attempt ·");
    expect(markup).toContain("Nov 5, 2026");
    expect(markup).toContain("earlier selections aren&#x27;t saved");
  });

  it("progress rows are named progress bars that say the counts in words", () => {
    const markup = html(
      createElement(ProgressBreakdown, {
        id: "type",
        title: "By type",
        rows: [{ key: "find", label: "Find", solved: 2, attempted: 1, total: 5 }],
      }),
    );
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-label="Find"');
    expect(markup).toContain('aria-valuetext="2 of 5 solved"');
    expect(markup).toContain("1 in progress");
  });

  it("the summary keeps distinct puzzles and repeated submissions apart", () => {
    const identity: ProfileIdentity = {
      login: "dev-1a2b",
      displayName: null,
      provider: "dev",
      memberSince: "2026-11-02T23:30:00.000Z",
      githubUrl: null,
    };
    const markup = html(createElement(IdentityCard, { identity, progress }));
    expect(markup).toMatch(/Attempted<\/dt><dd[^>]*>4<\/dd><dd[^>]*>distinct puzzles, solved ones included/);
    expect(markup).toMatch(/In progress<\/dt><dd[^>]*>1</);
    expect(markup).toMatch(/Submissions<\/dt><dd[^>]*>12<\/dd><dd[^>]*>graded answers, repeats included/);
    expect(markup).toContain('href="/puzzles"');
  });

  const streaks: PracticeStreaks = { current: 2, longest: 7, submissionsToday: 0, today: "2026-11-06" };
  const tracker = (selectedDate: string | null = null) => {
    const activity = buildActivity(resolvePeriod("rolling", "2026-11-06"), "2026-11-06", "2026-10-01", [
      { date: "2026-11-05", submissions: 2, passed: 1 },
    ]);
    return html(
      createElement(ActivityTracker, {
        activity,
        streaks,
        loading: false,
        requested: "rolling",
        error: null,
        onPeriodChange: () => {},
        onRetry: () => {},
        selectedDate,
        onSelectDate: () => {},
      }),
    );
  };

  it("the tracker is a grid with one tab stop, named cells and a text alternative", () => {
    const markup = tracker();
    expect(markup).toContain('role="grid"');
    expect(markup.match(/role="gridcell"/g)).toHaveLength(365);
    // Only one cell is in the Tab order: today, when nothing is selected.
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(/tabindex="0"[^>]*data-today="true"|data-today="true"[^>]*tabindex="0"/);
    expect(markup).toContain('aria-label="November 5, 2026: 2 submissions, 1 correct."');
    expect(markup).toContain('aria-label="November 6, 2026 (today): no submissions."');
    expect(markup).toContain('aria-label="September 30, 2026: before your history starts."');
    expect(markup).toContain("Show active days as a table");
    expect(markup).toContain("Last 365 days: 2 submissions");
    expect(markup).toContain("No submissions today");
    expect(markup).toContain('data-testid="streak-current"><strong class="tabular">2</strong>');
    expect(markup).toContain('data-testid="streak-longest"><strong class="tabular">7</strong>');
    for (const level of ["No submissions", "1 submission", "2–3 submissions", "4–6 submissions", "7 or more submissions"]) {
      expect(markup).toContain(level);
    }
  });

  it("a selected date takes the tab stop and offers a reset", () => {
    const markup = tracker("2026-11-05");
    expect(markup).toMatch(/aria-selected="true"[^>]*data-date="2026-11-05"|data-date="2026-11-05"[^>]*aria-selected="true"/);
    expect(markup).toContain("Clear date");
    expect(markup).toContain("November 5, 2026");
  });

  it("the first-solve chart steps up from its baseline, with a table of first solves", () => {
    const timeline = {
      start: "2026-01-01",
      end: "2026-12-31",
      baseline: 3,
      solves: [
        { date: "2026-02-01", count: 2 },
        { date: "2026-03-01", count: 1 },
      ],
    };
    expect(cumulativeSolves(timeline)).toEqual([
      { date: "2026-02-01", added: 2, total: 5 },
      { date: "2026-03-01", added: 1, total: 6 },
    ]);
    const markup = html(createElement(SolveChart, { timeline, label: "2026" }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain("3 puzzles first solved in this period, 6 in total by December 31, 2026.");
    expect(markup).toContain("Show first solves as a table");
    expect(markup).not.toMatch(/speed|skill|accuracy|mastery/i);
  });

});

describe("formatting", () => {
  it("formats in US English and UTC", () => {
    expect(formatDate("2026-11-06T23:30:00.000Z")).toBe("Nov 6, 2026");
    expect(formatDateTime("2026-11-06T15:04:00.000Z")).toBe("Nov 6, 2026, 3:04 PM UTC");
    expect(formatDay("2026-11-06")).toBe("Fri, Nov 6, 2026");
    expect(plural(1, "attempt", "attempts")).toBe("1 attempt");
    expect(plural(1200, "attempt", "attempts")).toBe("1,200 attempts");
  });

  it("gives every login stable initials and a color", () => {
    expect(initials("octocat")).toBe("O");
    expect(initials("octo-cat")).toBe("OC");
    expect(initials("dev_1a2b")).toBe("D1");
    expect(avatarTone("octocat")).toBe(avatarTone("octocat"));
    expect(avatarTone("octocat")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
