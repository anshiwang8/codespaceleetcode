import { makeSignature } from "better-auth/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as historyRoute } from "@/app/api/me/history/route";
import { GET as profileRoute } from "@/app/api/me/profile/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import type { HistoryPage, ProfileResponse, Submission } from "@/lib/api-types";
import { getAuth } from "@/lib/server/better-auth";
import { getPool } from "@/lib/server/db";
import {
  activityWindow,
  completionPercent,
  fillActivity,
  getActivity,
  getHistory,
  getProfile,
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

describe("activity window", () => {
  it("is the 90 UTC days ending on today's UTC date, oldest first", () => {
    const window = activityWindow(new Date("2026-03-02T00:30:00Z"));
    expect(window).toHaveLength(90);
    expect(window.at(-1)).toBe("2026-03-02");
    expect(window[0]).toBe("2025-12-03");
    // 23:59 UTC is still the same day, whatever the server's own zone.
    expect(activityWindow(new Date("2026-03-01T23:59:59Z")).at(-1)).toBe("2026-03-01");
  });

  it("fills empty days and totals the rest", () => {
    const window = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const activity = fillActivity(window, [{ date: "2026-01-02", submissions: 3, passed: 1 }]);
    expect(activity).toEqual({
      timeZone: "UTC",
      days: [
        { date: "2026-01-01", submissions: 0, passed: 0 },
        { date: "2026-01-02", submissions: 3, passed: 1 },
        { date: "2026-01-03", submissions: 0, passed: 0 },
      ],
      activeDays: 1,
      submissions: 3,
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
    expect(profile.activity.days).toHaveLength(90);
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

  it("puts a submission on its UTC day, and leaves out days outside the window", async () => {
    await signIn("profile-days");
    const id = await userIdFor("profile-days");
    const now = new Date("2026-03-02T12:00:00Z");
    await insertSubmission(id, "fx-file", false, "2026-03-01T23:59:59.999Z");
    await insertSubmission(id, "fx-file", true, "2026-03-02T00:00:00Z");
    await insertSubmission(id, "fx-symbol", false, "2025-12-03T00:00:00Z"); // first day of the window
    await insertSubmission(id, "fx-symbol", false, "2025-12-02T23:59:59Z"); // the day before it
    await insertSubmission(id, "fx-symbol", false, "2026-03-03T00:00:00Z"); // after "now"'s day

    const activity = await getActivity(id, now);
    const day = (date: string) => activity.days.find((entry) => entry.date === date);
    expect(day("2026-03-01")).toEqual({ date: "2026-03-01", submissions: 1, passed: 0 });
    expect(day("2026-03-02")).toEqual({ date: "2026-03-02", submissions: 1, passed: 1 });
    expect(day("2025-12-03")).toEqual({ date: "2025-12-03", submissions: 1, passed: 0 });
    expect(day("2025-12-02")).toBeUndefined();
    expect(activity).toMatchObject({ submissions: 3, activeDays: 3 });
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
      displayName: "The Octocat",
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
