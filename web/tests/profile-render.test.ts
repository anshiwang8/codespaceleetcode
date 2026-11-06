import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfileError from "@/app/(app)/profile/error";
import ProfileLoading from "@/app/(app)/profile/loading";
import { ActivityCalendar } from "@/components/profile/ActivityCalendar";
import { ContinuePracticing } from "@/components/profile/ContinuePracticing";
import { IdentityCard } from "@/components/profile/IdentityCard";
import { ProgressBreakdown } from "@/components/profile/ProgressBreakdown";
import { avatarTone, initials } from "@/components/site/Avatar";
import type { ProfileIdentity, ProfileProgress } from "@/lib/api-types";
import { formatDate, formatDateTime, formatDay, plural } from "@/lib/format";
import { fillActivity } from "@/lib/server/profile";

// The profile's states rendered to HTML, the way the server sends them.

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

const emptyCount = { solved: 0, attempted: 0, total: 0 };
const progress: ProfileProgress = {
  solved: 3,
  attempted: 1,
  total: 10,
  completionPercent: 30,
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
    expect(markup).toContain("3</strong> of <span");
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

  it("the activity grid has a text summary and a table of active days", () => {
    const activity = fillActivity(
      ["2026-11-04", "2026-11-05", "2026-11-06"],
      [{ date: "2026-11-05", submissions: 2, passed: 1 }],
    );
    const markup = html(createElement(ActivityCalendar, { activity }));
    expect(markup).toContain("2 submissions on 1 day in the last 90 days.");
    expect(markup).toContain("one day in UTC");
    expect(markup).toContain("Thu, Nov 5, 2026");
    // The picture is hidden from screen readers; the table carries the same data.
    expect(markup).toMatch(/class="[^"]*calendar[^"]*" style="[^"]*" aria-hidden="true"/);
    expect(markup).toContain("<caption");
  });

  it("an empty activity window says there's nothing yet", () => {
    const activity = fillActivity(["2026-11-06"], []);
    expect(html(createElement(ActivityCalendar, { activity }))).toContain("No submissions in the last 90 days.");
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
