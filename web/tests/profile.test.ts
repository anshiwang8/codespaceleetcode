import { makeSignature } from "better-auth/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as activityRoute } from "@/app/api/me/activity/route";
import { GET as historyRoute } from "@/app/api/me/history/route";
import { GET as profileRoute } from "@/app/api/me/profile/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import type { ActivityResponse, HistoryPage, ProfileResponse, Submission } from "@/lib/api-types";
import { getAuth } from "@/lib/server/better-auth";
import { getPool } from "@/lib/server/db";
import {
  addDays,
  buildActivity,
  buildTimeline,
  completionPercent,
  getActivity,
  getHistory,
  getProfile,
  parsePeriodKey,
  resolvePeriod,
  selectableYears,
  streaksFrom,
  summarizeProgress,
  type ProgressRow,
} from "@/lib/server/profile";
import { CONFIG_FILE, HANDLE_SYMBOL, PUBLISHED_PUZZLE_COUNT, ROUTER_FILE, seedFixtures, STEP_SYMBOL } from "./fixtures";
import { expectNoAnswerData, hasDatabase, makeRequest, params, signIn } from "./helpers";

function row(overrides: Partial<ProgressRow>): ProgressRow {
  return {
    type: "find",
    difficulty: "easy",
    tags: [],
    repo_slug: "acme",
    language: "typescript",
    status: null,
    ...overrides,
  };
}

describe("summarizeProgress", () => {
  it("is all zeros with nothing published", () => {
    const progress = summarizeProgress([]);
    expect(progress).toMatchObject({ solved: 0, attempted: 0, total: 0, completionPercent: 0, byRepo: [], byTopic: [] });
    expect(progress.byType.find).toEqual({ solved: 0, attempted: 0, total: 0 });
    expect(progress.byDifficulty.hard).toEqual({ solved: 0, attempted: 0, total: 0 });
  });

  it("counts each puzzle once overall, and once under each of its topics", () => {
    const progress = summarizeProgress([
      row({ tags: ["routing", "errors"], status: "solved" }),
      row({ tags: ["routing"], status: "attempted", type: "trace", difficulty: "hard" }),
      // A tag repeated on one puzzle still counts that puzzle once.
      row({ tags: ["errors", "errors"], repo_slug: "zeta", language: "python" }),
    ]);
    expect(progress).toMatchObject({ solved: 1, attempted: 1, total: 3, completionPercent: 33 });
    expect(progress.byType).toMatchObject({ find: { solved: 1, attempted: 0, total: 2 }, trace: { attempted: 1, total: 1 } });
    expect(progress.byDifficulty).toMatchObject({ easy: { total: 2 }, hard: { attempted: 1, total: 1 } });
    expect(progress.byTopic).toEqual([
      { topic: "routing", solved: 1, attempted: 1, total: 2 },
      { topic: "errors", solved: 1, attempted: 0, total: 2 },
    ]);
    // Topics overlap, so their totals add up to more than the number of puzzles.
    expect(progress.byTopic.reduce((sum, topic) => sum + topic.total, 0)).toBeGreaterThan(progress.total);
    expect(progress.byRepo).toEqual([
      { repo: "acme", language: "typescript", solved: 1, attempted: 1, total: 2 },
      { repo: "zeta", language: "python", solved: 0, attempted: 0, total: 1 },
    ]);
  });

  it("rounds completion down, so it reads 100 only when everything is solved", () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(2, 3)).toBe(66);
    expect(completionPercent(135, 136)).toBe(99);
    expect(completionPercent(136, 136)).toBe(100);
  });
});

describe("activity periods", () => {
  it("rolling is the 365 UTC dates ending today, today included", () => {
    const period = resolvePeriod("rolling", "2026-03-02");
    expect(period).toEqual({ key: "rolling", label: "Last 365 days", start: "2025-03-03", end: "2026-03-02" });
    const activity = buildActivity(period, "2026-03-02", "2020-01-01", []);
    expect(activity.days).toHaveLength(365);
    expect(activity.days.at(-1)?.date).toBe("2026-03-02");
  });

  it("a calendar year has 365 or 366 dates, leap day included", () => {
    expect(buildActivity(resolvePeriod("2025", "2026-11-06"), "2026-11-06", "2020-01-01", []).days).toHaveLength(365);
    const leap = buildActivity(resolvePeriod("2024", "2026-11-06"), "2026-11-06", "2020-01-01", []);
    expect(leap.days).toHaveLength(366);
    expect(leap.days.map((day) => day.date)).toContain("2024-02-29");
    expect(leap.days[0]?.date).toBe("2024-01-01");
    expect(leap.days.at(-1)?.date).toBe("2024-12-31");
    // A rolling window across a leap day still has 365 dates.
    expect(buildActivity(resolvePeriod("rolling", "2024-12-31"), "2024-12-31", "2020-01-01", []).days).toHaveLength(365);
  });

  it("adds days across month, year and leap boundaries in UTC", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("marks dates after today and before the history starts as unavailable, not zero", () => {
    const activity = buildActivity(resolvePeriod("2026", "2026-11-06"), "2026-11-06", "2026-03-10", [
      { date: "2026-03-10", submissions: 2, passed: 1 },
      { date: "2026-11-06", submissions: 1, passed: 1 },
    ]);
    const day = (date: string) => activity.days.find((entry) => entry.date === date);
    expect(day("2026-03-09")).toEqual({ date: "2026-03-09", submissions: 0, passed: 0, available: false });
    expect(day("2026-03-10")).toEqual({ date: "2026-03-10", submissions: 2, passed: 1, available: true });
    expect(day("2026-06-01")).toEqual({ date: "2026-06-01", submissions: 0, passed: 0, available: true });
    expect(day("2026-11-06")?.available).toBe(true);
    expect(day("2026-11-07")?.available).toBe(false);
    expect(activity).toMatchObject({ activeDays: 2, submissions: 3, today: "2026-11-06", years: [2026] });
  });

  it("offers each year from the history's first through today's, and reads period keys strictly", () => {
    expect(selectableYears("2024-12-31", "2026-01-01")).toEqual([2024, 2025, 2026]);
    expect(selectableYears("2026-05-01", "2026-11-06")).toEqual([2026]);
    expect(parsePeriodKey(undefined)).toBe("rolling");
    expect(parsePeriodKey("rolling")).toBe("rolling");
    expect(parsePeriodKey("2025")).toBe("2025");
    for (const bad of ["25", "20256", "1899", "abc", "2025 ", "-2025"]) expect(parsePeriodKey(bad)).toBeNull();
  });
});

describe("streaks", () => {
  const today = "2026-11-06";

  it("counts the run ending today, or ending yesterday while today is still open", () => {
    expect(streaksFrom({ lastDay: today, lastLength: 4, longest: 9 }, today, 2)).toEqual({
      current: 4,
      longest: 9,
      submissionsToday: 2,
      today,
    });
    expect(streaksFrom({ lastDay: "2026-11-05", lastLength: 4, longest: 9 }, today, 0).current).toBe(4);
  });

  it("is zero when neither today nor yesterday is active, or with no history", () => {
    expect(streaksFrom({ lastDay: "2026-11-04", lastLength: 4, longest: 9 }, today, 0).current).toBe(0);
    expect(streaksFrom({ lastDay: null, lastLength: 0, longest: 0 }, today, 0)).toEqual({
      current: 0,
      longest: 0,
      submissionsToday: 0,
      today,
    });
  });

  it("handles a run that ended yesterday across a year boundary", () => {
    expect(streaksFrom({ lastDay: "2025-12-31", lastLength: 3, longest: 3 }, "2026-01-01", 0).current).toBe(3);
  });
});

describe("first-solve timeline", () => {
  it("carries solves before the period in as a baseline and leaves out later ones", () => {
    const period = resolvePeriod("2025", "2026-11-06");
    const timeline = buildTimeline(period, [
      { date: "2026-01-02", count: 1 },
      { date: "2025-06-01", count: 2 },
      { date: "2024-12-31", count: 3 },
      { date: "2025-01-01", count: 1 },
    ]);
    expect(timeline).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
      baseline: 3,
      solves: [
        { date: "2025-01-01", count: 1 },
        { date: "2025-06-01", count: 2 },
      ],
    });
  });
});

async function userIdFor(login: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>("select id from users where github_login = $1", [login]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`no user ${login}`);
  return id;
}

async function submit(cookie: string, slug: string, body: Submission, correct: boolean): Promise<void> {
  const response = await submitRoute(makeRequest(`/api/puzzles/${slug}/submit`, { cookie, body }), params({ slug }));
  expect(await response.json()).toMatchObject({ correct });
}

async function profileFor(cookie?: string): Promise<Response> {
  return profileRoute(makeRequest("/api/me/profile", { cookie }), undefined);
}

async function historyFor(cookie: string | undefined, query = ""): Promise<Response> {
  return historyRoute(makeRequest(`/api/me/history${query}`, { cookie }), undefined);
}

/** A submission recorded straight into the table, at a chosen time. */
async function insertSubmission(userId: string, slug: string, correct: boolean, at: string): Promise<void> {
  await getPool().query(
    `insert into submissions (user_id, puzzle_id, answer_json, correct, created_at)
     select $1, id, '{}'::jsonb, $3, $4 from puzzles where slug = $2`,
    [userId, slug, correct, at],
  );
}

describe.skipIf(!hasDatabase)("profile data", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  describe("access", () => {
    it("needs sign-in for the profile and the history", async () => {
      const profile = await profileFor(undefined);
      expect(profile.status).toBe(401);
      expect(profile.headers.get("cache-control")).toBe("no-store");
      expect((await historyFor(undefined)).status).toBe(401);
    });

    it("refuses a malformed cursor or an oversized page", async () => {
      const cookie = await signIn("profile-params");
      for (const query of ["?before=abc", "?before=0", "?before=99999999999999999999", "?limit=51", "?limit=0", "?other=1"]) {
        expect((await historyFor(cookie, query)).status).toBe(400);
      }
      expect((await historyFor(cookie, "?limit=50")).status).toBe(200);
    });
  });

  it("is empty but complete for a new user", async () => {
    const cookie = await signIn("profile-new");
    const response = await profileFor(cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const profile = (await response.json()) as ProfileResponse;
    expect(profile.identity).toMatchObject({ login: "profile-new", provider: "dev", githubUrl: null, displayName: null });
    expect(new Date(profile.identity.memberSince).toISOString()).toBe(profile.identity.memberSince);
    expect(profile.progress).toMatchObject({ solved: 0, attempted: 0, total: PUBLISHED_PUZZLE_COUNT, completionPercent: 0 });
    expect(profile.unfinished).toEqual([]);
    expect(profile.activity).toMatchObject({ timeZone: "UTC", activeDays: 0, submissions: 0 });
    expect(profile.activity.days).toHaveLength(365);
    expect(profile.activity.label).toBe("Last 365 days");
    // Dates before the account was created are unavailable, not missed practice.
    expect(profile.activity.days[0]?.available).toBe(false);
    expect(profile.activity.days.at(-1)?.available).toBe(true);
    expect(profile.streaks).toMatchObject({ current: 0, longest: 0, submissionsToday: 0 });
    expect(profile.timeline).toMatchObject({ baseline: 0, solves: [] });
    expect(profile.progress.submissions).toBe(0);
    expect(profile.history).toEqual({ entries: [], nextCursor: null });
  });

  it("counts repeated submissions once per puzzle, and keeps a solve after a later miss", async () => {
    const cookie = await signIn("profile-busy");
    await submit(cookie, "fx-file", { kind: "file", path: ROUTER_FILE }, false);
    await submit(cookie, "fx-file", { kind: "file", path: ROUTER_FILE }, false);
    await submit(cookie, "fx-symbol", { kind: "symbol", id: HANDLE_SYMBOL }, true);
    await submit(cookie, "fx-symbol", { kind: "symbol", id: STEP_SYMBOL }, false);

    const profile = (await (await profileFor(cookie)).json()) as ProfileResponse;
    expect(profile.progress).toMatchObject({ solved: 1, attempted: 1, total: PUBLISHED_PUZZLE_COUNT });
    expect(profile.progress.byType.find).toEqual({ solved: 1, attempted: 1, total: 4 });
    expect(profile.progress.byDifficulty.easy).toEqual({ solved: 1, attempted: 1, total: 3 });
    expect(profile.progress.byRepo.find((repo) => repo.repo === "acme-router")).toMatchObject({ solved: 1, attempted: 1 });
    // fx-symbol has two topics, and counts under both.
    expect(profile.progress.byTopic.find((topic) => topic.topic === "routing")).toMatchObject({ solved: 1, total: 1 });
    expect(profile.progress.byTopic.find((topic) => topic.topic === "http")).toMatchObject({ solved: 1, total: 1 });

    // fx-symbol stays solved, so only fx-file is unfinished.
    expect(profile.unfinished).toHaveLength(1);
    expect(profile.unfinished[0]).toMatchObject({ slug: "fx-file", attempts: 2, type: "find", difficulty: "easy" });
    expect(profile.unfinished[0]?.lastSubmittedAt).not.toBeNull();

    const today = profile.activity.days.at(-1);
    expect(today).toMatchObject({ submissions: 4, passed: 1 });
    expect(profile.activity).toMatchObject({ activeDays: 1, submissions: 4 });

    expect(profile.history.entries.map((entry) => [entry.slug, entry.passed])).toEqual([
      ["fx-symbol", false],
      ["fx-symbol", true],
      ["fx-file", false],
      ["fx-file", false],
    ]);
    expect(profile.history.nextCursor).toBeNull();
  });

  it("leaves out unpublished puzzles everywhere", async () => {
    const cookie = await signIn("profile-hidden");
    const id = await userIdFor("profile-hidden");
    await getPool().query(
      `insert into progress (user_id, puzzle_id, status, attempts)
       select $1, id, 'attempted', 3 from puzzles where slug in ('fx-hidden', 'fx-hidden-repo')`,
      [id],
    );
    await insertSubmission(id, "fx-hidden", false, new Date().toISOString());
    await insertSubmission(id, "fx-hidden-repo", true, new Date().toISOString());

    const profile = (await (await profileFor(cookie)).json()) as ProfileResponse;
    expect(profile.progress).toMatchObject({ solved: 0, attempted: 0, total: PUBLISHED_PUZZLE_COUNT });
    expect(profile.progress.byRepo.map((repo) => repo.repo)).not.toContain("hidden-repo");
    expect(profile.progress.byTopic.map((topic) => topic.topic)).not.toContain("hidden-tag");
    expect(profile.unfinished).toEqual([]);
    expect(profile.activity.submissions).toBe(0);
    expect(profile.history.entries).toEqual([]);
    expect(JSON.stringify(profile)).not.toContain("fx-hidden");
  });

  it("shows each user only their own data, even given another user's cursor", async () => {
    const alice = await signIn("profile-alice");
    const bob = await signIn("profile-bob");
    await submit(alice, "fx-file", { kind: "file", path: CONFIG_FILE }, true);
    await submit(alice, "fx-choice", { kind: "choice", option: "opt-a" }, false);
    await submit(alice, "fx-choice", { kind: "choice", option: "opt-a" }, false);

    const bobs = (await (await profileFor(bob)).json()) as ProfileResponse;
    expect(bobs.identity.login).toBe("profile-bob");
    expect(bobs.progress).toMatchObject({ solved: 0, attempted: 0 });
    expect(bobs.unfinished).toEqual([]);
    expect(bobs.activity.submissions).toBe(0);
    expect(bobs.history.entries).toEqual([]);

    const alicePage = (await (await historyFor(alice, "?limit=1")).json()) as HistoryPage;
    expect(alicePage.entries).toHaveLength(1);
    expect(alicePage.nextCursor).not.toBeNull();
    const stolen = (await (await historyFor(bob, `?before=${alicePage.nextCursor}`)).json()) as HistoryPage;
    expect(stolen).toEqual({ entries: [], nextCursor: null });

    const alices = (await (await profileFor(alice)).json()) as ProfileResponse;
    expect(alices.progress).toMatchObject({ solved: 1, attempted: 1 });
  });

  it("pages through history newest first, without repeats or gaps", async () => {
    await signIn("profile-pager");
    const id = await userIdFor("profile-pager");
    const slugs = ["fx-symbol", "fx-file", "fx-choice", "fx-set", "fx-sequence"];
    for (let index = 0; index < 23; index++) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
      await insertSubmission(id, slugs[index % slugs.length] ?? "fx-file", index % 4 === 0, at);
    }
    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | null = null;
    do {
      const page: HistoryPage = await getHistory(id, { before: cursor });
      sizes.push(page.entries.length);
      seen.push(...page.entries.map((entry) => entry.submittedAt));
      cursor = page.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([10, 10, 3]);
    expect(new Set(seen).size).toBe(23);
    expect([...seen].sort().reverse()).toEqual(seen);
    // Limits are clamped to what the route allows.
    expect((await getHistory(id, { limit: 500 })).entries).toHaveLength(23);
    expect((await getHistory(id, { limit: 0 })).entries).toHaveLength(1);
  });

  it("puts a submission on its UTC date, and leaves out dates outside the period", async () => {
    await signIn("profile-days");
    const id = await userIdFor("profile-days");
    const now = new Date("2026-03-02T12:00:00Z");
    await insertSubmission(id, "fx-file", false, "2026-03-01T23:59:59.999Z");
    await insertSubmission(id, "fx-file", true, "2026-03-02T00:00:00Z");
    await insertSubmission(id, "fx-symbol", false, "2025-03-03T00:00:00Z"); // first date of the rolling period
    await insertSubmission(id, "fx-symbol", false, "2025-03-02T23:59:59Z"); // the date before it
    await insertSubmission(id, "fx-symbol", false, "2026-03-03T00:00:00Z"); // after "now"'s date

    const response = await getActivity(id, "rolling", now);
    const activity = response?.activity;
    const day = (date: string) => activity?.days.find((entry) => entry.date === date);
    expect(day("2026-03-01")).toEqual({ date: "2026-03-01", submissions: 1, passed: 0, available: true });
    expect(day("2026-03-02")).toEqual({ date: "2026-03-02", submissions: 1, passed: 1, available: true });
    expect(day("2025-03-03")).toEqual({ date: "2025-03-03", submissions: 1, passed: 0, available: true });
    expect(day("2025-03-02")).toBeUndefined();
    expect(activity).toMatchObject({ submissions: 3, activeDays: 3, today: "2026-03-02" });
    // The earlier submission predates the account, so the history starts there and 2025 is offered.
    expect(activity?.years).toEqual([2025, 2026]);
  });

  it("counts lifetime streaks from distinct UTC dates, longer than any one period", async () => {
    await signIn("profile-streaks");
    const id = await userIdFor("profile-streaks");
    // 400 consecutive dates ending 2025-12-31: longer than a year, so it can't come from one period.
    await getPool().query(
      `insert into submissions (user_id, puzzle_id, answer_json, correct, created_at)
       select $1, p.id, '{}'::jsonb, false, ('2025-12-31'::date - n + time '23:30') at time zone 'UTC'
         from puzzles p cross join generate_series(0, 399) n
        where p.slug = 'fx-file'`,
      [id],
    );
    // Then a gap, and three dates ending yesterday, with two submissions on one of them.
    for (const at of ["2026-11-03T00:00:00Z", "2026-11-04T08:00:00Z", "2026-11-04T09:00:00Z", "2026-11-05T23:59:59Z"]) {
      await insertSubmission(id, "fx-symbol", false, at);
    }
    // Unpublished puzzles never count, even on today's date.
    await insertSubmission(id, "fx-hidden", true, "2026-11-06T01:00:00Z");

    const open = await getProfile(id, new Date("2026-11-06T12:00:00Z"));
    expect(open?.streaks).toEqual({ current: 3, longest: 400, submissionsToday: 0, today: "2026-11-06" });

    await insertSubmission(id, "fx-symbol", true, "2026-11-06T00:00:00Z");
    const practiced = await getProfile(id, new Date("2026-11-06T12:00:00Z"));
    expect(practiced?.streaks).toEqual({ current: 4, longest: 400, submissionsToday: 1, today: "2026-11-06" });

    // Two days later with nothing new, the current streak has ended; the longest hasn't changed.
    const later = await getProfile(id, new Date("2026-11-08T00:00:00Z"));
    expect(later?.streaks).toMatchObject({ current: 0, longest: 400 });
    // The year picker doesn't change lifetime streaks: they aren't part of the period response.
    const year = (await getActivity(id, "2025", new Date("2026-11-06T12:00:00Z"))) as ActivityResponse;
    expect(year.activity.activeDays).toBe(365);
    expect(Object.keys(year)).toEqual(["activity", "timeline"]);
  });

  it("dates each solved puzzle once, by its first correct submission", async () => {
    await signIn("profile-solves");
    const id = await userIdFor("profile-solves");
    const now = new Date("2026-11-06T12:00:00Z");
    // fx-file: wrong, then right, then right again. Only the first right one counts.
    await insertSubmission(id, "fx-file", false, "2025-12-30T10:00:00Z");
    await insertSubmission(id, "fx-file", true, "2025-12-31T10:00:00Z");
    await insertSubmission(id, "fx-file", true, "2026-02-01T10:00:00Z");
    await insertSubmission(id, "fx-symbol", true, "2026-02-01T11:00:00Z");
    await insertSubmission(id, "fx-hidden", true, "2026-02-01T12:00:00Z");
    await getPool().query(
      `insert into progress (user_id, puzzle_id, status, attempts, solved_at)
       select $1, id, 'solved', 1, now() from puzzles where slug in ('fx-file', 'fx-symbol', 'fx-hidden')`,
      [id],
    );
    const year = (await getActivity(id, "2026", now)) as ActivityResponse;
    expect(year.timeline).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
      baseline: 1,
      solves: [{ date: "2026-02-01", count: 1 }],
    });
    const before = (await getActivity(id, "2025", now)) as ActivityResponse;
    expect(before.timeline.solves).toEqual([{ date: "2025-12-31", count: 1 }]);
    // The chart's total matches the solved count.
    const profile = await getProfile(id, now);
    const total =
      (profile?.timeline.baseline ?? 0) + (profile?.timeline.solves.reduce((sum, day) => sum + day.count, 0) ?? 0);
    expect(total).toBe(profile?.progress.solved);
    expect(profile?.progress.submissions).toBe(4);
  });

  it("serves a period on /api/me/activity, and refuses a year outside the user's history", async () => {
    const cookie = await signIn("profile-period");
    const get = (query: string, withCookie = true) =>
      activityRoute(makeRequest(`/api/me/activity${query}`, withCookie ? { cookie } : {}), undefined);
    expect((await get("", false)).status).toBe(401);
    const rolling = await get("?period=rolling");
    expect(rolling.status).toBe(200);
    expect(rolling.headers.get("cache-control")).toBe("no-store");
    const body = (await rolling.json()) as ActivityResponse;
    expect(body.activity.label).toBe("Last 365 days");
    const thisYear = body.activity.today.slice(0, 4);
    expect((await get(`?period=${thisYear}`)).status).toBe(200);
    for (const bad of ["?period=1999", `?period=${Number(thisYear) + 1}`, "?period=abc", "?period=2025&x=1"]) {
      expect((await get(bad)).status, bad).toBe(400);
    }
    expectNoAnswerData(JSON.stringify(body));
  });

  it("filters history on the server, across pages, by type, difficulty, repository, result and date", async () => {
    const cookie = await signIn("profile-filters");
    const id = await userIdFor("profile-filters");
    for (let index = 0; index < 14; index++) {
      const at = new Date(Date.UTC(2026, 9, 1 + (index % 2), 12, index)).toISOString();
      await insertSubmission(id, index % 2 === 0 ? "fx-file" : "fx-sequence", index % 3 === 0, at);
    }
    await insertSubmission(id, "fx-other", true, "2026-10-01T23:59:59Z");
    await insertSubmission(id, "fx-hidden", true, "2026-10-01T13:00:00Z");

    const pages = async (query: string) => {
      const seen: HistoryPage["entries"] = [];
      let before = "";
      for (;;) {
        const response = await historyFor(cookie, `?limit=3${query}${before ? `&before=${before}` : ""}`);
        expect(response.status).toBe(200);
        const page = (await response.json()) as HistoryPage;
        seen.push(...page.entries);
        if (!page.nextCursor) return seen;
        before = page.nextCursor;
      }
    };
    const trace = await pages("&type=trace");
    expect(trace).toHaveLength(7);
    expect(new Set(trace.map((entry) => entry.id)).size).toBe(7);
    expect(trace.every((entry) => entry.type === "trace")).toBe(true);
    const medium = await pages("&difficulty=medium");
    expect(medium.every((entry) => entry.difficulty === "medium")).toBe(true);
    expect((await pages("&repo=other-lib")).map((entry) => entry.slug)).toEqual(["fx-other"]);
    const failed = await pages("&outcome=failed");
    expect(failed.every((entry) => !entry.passed)).toBe(true);
    const passed = await pages("&outcome=passed");
    expect(passed.every((entry) => entry.passed)).toBe(true);
    expect(failed.length + passed.length).toBe(15);
    // A UTC date: 23:59:59 belongs to Oct 1; the unpublished submission never shows.
    const first = await pages("&date=2026-10-01");
    expect(first).toHaveLength(8);
    expect(first.every((entry) => entry.submittedAt.startsWith("2026-10-01"))).toBe(true);
    expect(first.map((entry) => entry.slug)).not.toContain("fx-hidden");
    expect(await pages("&date=2026-10-03")).toEqual([]);
    expect(await pages("&date=2026-10-01&type=trace&outcome=passed")).toEqual(
      (await pages("&type=trace&outcome=passed")).filter((entry) => entry.submittedAt.startsWith("2026-10-01")),
    );
    for (const bad of ["?date=2026-02-30", "?date=2026-1-01", "?outcome=correct", "?type=quiz", "?difficulty=x"]) {
      expect((await historyFor(cookie, bad)).status, bad).toBe(400);
    }
    // Another user's filters see none of this.
    const other = await signIn("profile-filters-other");
    const response = await historyRoute(makeRequest("/api/me/history?date=2026-10-01", { cookie: other }), undefined);
    expect(((await response.json()) as HistoryPage).entries).toEqual([]);
  });

  it("describes a GitHub account without its email, image, tokens or answers", async () => {
    const context = await getAuth().$context;
    const user = await context.internalAdapter.createUser(
      {
        name: "The Octocat",
        email: "9001@github-user.invalid",
        emailVerified: false,
        image: "https://avatars.example.test/u/9001",
        githubLogin: "octo-profile",
      },
      { method: "oauth", oauth: { providerId: "github", profile: { login: "octo-profile" } } },
    );
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "github",
      accountId: "9001",
      accessToken: "gho_profiletoken",
    });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
    await submit(cookie, "fx-file", { kind: "file", path: CONFIG_FILE }, true);

    const response = await profileFor(cookie);
    expect(response.status).toBe(200);
    const text = await response.text();
    const profile = JSON.parse(text) as ProfileResponse;
    expect(profile.identity).toEqual({
      login: "octo-profile",
      // The display name is the user's own choice in Settings, never GitHub's.
      displayName: null,
      pronouns: null,
      bio: null,
      links: { custom: [] },
      avatarVersion: null,
      provider: "github",
      memberSince: expect.any(String) as string,
      githubUrl: "https://github.com/octo-profile",
    });
    for (const secret of [
      "github-user.invalid",
      "dev-login.invalid",
      "avatars.example.test",
      "gho_profiletoken",
      session.token,
      "\"email\"",
      "\"image\"",
      "answer",
      CONFIG_FILE,
    ]) {
      expect(text).not.toContain(secret);
    }
    expectNoAnswerData(text);
    expectNoAnswerData(await (await historyFor(cookie)).text());
  });

  it("gives null for a user who no longer exists", async () => {
    expect(await getProfile("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
