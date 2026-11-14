import { makeSignature } from "better-auth/crypto";
import { POST as learnCheckRoute } from "@/app/api/learn/[slug]/check/route";
import { COURSE } from "@/lib/learn/course.generated";
import { beforeAll, describe, expect, it } from "vitest";
import { DELETE as deleteMe, GET as getMe } from "@/app/api/me/route";
import { PUT as leaderboardRoute } from "@/app/api/me/leaderboard/route";
import { POST as hintRoute } from "@/app/api/puzzles/[slug]/hints/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import type { MeResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { getAuth } from "@/lib/server/better-auth";
import { getPool } from "@/lib/server/db";
import { isSameOriginRequest } from "@/lib/server/http";
import { isRateLimited, SUBMIT_LIMIT } from "@/lib/server/rate-limit";
import { CONFIG_FILE, seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, params, signIn } from "./helpers";

const ORIGIN = "http://localhost:3000";

function deleteRequest(cookie: string | undefined, options: { origin?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  return deleteMe(
    makeRequest("/api/me", { method: "DELETE", cookie, headers, body: "body" in options ? options.body : { confirm: "DELETE" } }),
    undefined,
  );
}

async function userIdFor(login: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>("select id from users where github_login = $1", [login]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`no user ${login}`);
  return id;
}

async function count(query: string, id: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(query, [id]);
  return Number(rows[0]?.n ?? 0);
}

async function submitOnce(cookie: string): Promise<void> {
  const response = await submitRoute(
    makeRequest("/api/puzzles/fx-file/submit", { cookie, body: { kind: "file", path: CONFIG_FILE } }),
    params({ slug: "fx-file" }),
  );
  expect(response.status).toBe(200);
}

/** Everything still recorded about a user, across every table that refers to them. */
async function traces(id: string) {
  return {
    authUsers: await count("select count(*) as n from auth_users where id = $1", id),
    users: await count("select count(*) as n from users where id = $1", id),
    sessions: await count("select count(*) as n from auth_sessions where user_id = $1", id),
    accounts: await count("select count(*) as n from auth_accounts where user_id = $1", id),
    submissions: await count("select count(*) as n from submissions where user_id = $1", id),
    progress: await count("select count(*) as n from progress where user_id = $1", id),
    rateLimits: await count("select count(*) as n from rate_limits where key like '%user:' || $1", id),
    hintReveals: await count("select count(*) as n from hint_reveals where user_id = $1", id),
    scoreEvents: await count("select count(*) as n from score_events where user_id = $1", id),
    challengeCompletions: await count("select count(*) as n from challenge_completions where user_id = $1", id),
    achievements: await count("select count(*) as n from user_achievements where user_id = $1", id),
    leaderboard: await count("select count(*) as n from leaderboard_entries where user_id = $1", id),
    profile: await count("select count(*) as n from user_profiles where user_id = $1", id),
    learn: await count("select count(*) as n from learn_progress where user_id = $1", id),
  };
}

const NOTHING = {
  authUsers: 0,
  users: 0,
  sessions: 0,
  accounts: 0,
  submissions: 0,
  progress: 0,
  rateLimits: 0,
  hintReveals: 0,
  scoreEvents: 0,
  challengeCompletions: 0,
  achievements: 0,
  leaderboard: 0,
  profile: 0,
  learn: 0,
};

/** Gives a user a row in every table migration 0009 added, through the real code paths. */
async function useEveryFeature(cookie: string, id: string): Promise<void> {
  const hint = await hintRoute(
    makeRequest("/api/puzzles/fx-file/hints", { cookie, headers: { origin: ORIGIN }, body: { level: 1 } }),
    params({ slug: "fx-file" }),
  );
  expect(hint.status).toBe(200);
  await submitOnce(cookie);
  const join = await leaderboardRoute(
    makeRequest("/api/me/leaderboard", { method: "PUT", cookie, headers: { origin: ORIGIN }, body: { publicName: `Leaver ${id.slice(0, 6)}` } }),
    undefined,
  );
  expect(join.status).toBe(200);
  await getPool().query(
    `insert into challenge_assignments (period_kind, period_start, puzzle_id)
     select 'daily', date '2020-01-01', id from puzzles where slug = 'fx-file' on conflict do nothing`,
  );
  await getPool().query(
    "insert into challenge_completions (user_id, period_kind, period_start) values ($1, 'daily', date '2020-01-01')",
    [id],
  );
  await getPool().query("insert into user_profiles (user_id, display_name) values ($1, 'Leaving')", [id]);
  // A Learn completion, through the real check route.
  const lesson = COURSE.lessons["values-and-assignments"];
  const check = await learnCheckRoute(
    makeRequest("/api/learn/values-and-assignments/check", {
      cookie,
      headers: { origin: ORIGIN },
      body: { revision: lesson?.revision, exerciseId: "exit", answer: { kind: "choice", choiceId: "8" } },
    }),
    params({ slug: "values-and-assignments" }),
  );
  expect(await check.json()).toMatchObject({ correct: true });
  const left = await traces(id);
  for (const key of ["hintReveals", "scoreEvents", "challengeCompletions", "achievements", "leaderboard", "profile", "learn"] as const) {
    expect(left[key], key).toBeGreaterThan(0);
  }
}

describe("isSameOriginRequest", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("accepts an Origin that matches the Host", () => {
    expect(isSameOriginRequest(headers({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
  });

  it("refuses another site, another port, a missing Origin, and a malformed one", () => {
    expect(isSameOriginRequest(headers({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(headers({ host: "localhost:3000", origin: "http://localhost:4000" }))).toBe(false);
    expect(isSameOriginRequest(headers({ host: "localhost:3000" }))).toBe(false);
    expect(isSameOriginRequest(headers({ host: "localhost:3000", origin: "null" }))).toBe(false);
  });
});

describe.skipIf(!hasDatabase)("DELETE /api/me", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  it("deletes a user's account, submissions, progress and counters, and signs them out", async () => {
    const cookie = await signIn("leaving-dev");
    const id = await userIdFor("leaving-dev");
    await useEveryFeature(cookie, id);
    expect((await traces(id)).submissions).toBe(1);

    const response = await deleteRequest(cookie);
    expect(response.status).toBe(200);
    expect(((await response.json()) as MeResponse).user).toBeNull();
    expect(await traces(id)).toEqual(NOTHING);

    const cleared = response.headers.getSetCookie();
    expect(cleared.some((line) => line.startsWith("cp_dev_login=;") && /Max-Age=0/i.test(line))).toBe(true);
    const sessionCookie = (await getAuth().$context).authCookies.sessionToken.name;
    expect(cleared.some((line) => line.startsWith(`${sessionCookie}=;`) && /Max-Age=0/i.test(line))).toBe(true);

    // The old cookie no longer names anyone.
    const me = await getMe(makeRequest("/api/me", { cookie }), undefined);
    expect(((await me.json()) as MeResponse).user).toBeNull();
  });

  it("leaves other users alone", async () => {
    const staying = await signIn("staying-dev");
    const stayingId = await userIdFor("staying-dev");
    await submitOnce(staying);
    const leaving = await signIn("leaving-dev-2");
    await submitOnce(leaving);

    expect((await deleteRequest(leaving)).status).toBe(200);
    const left = await traces(stayingId);
    expect(left.authUsers).toBe(1);
    expect(left.submissions).toBe(1);
    expect(left.progress).toBe(1);
    expect(left.rateLimits).toBe(1);
  });

  it("deletes a GitHub user's sessions, linked account and token", async () => {
    const context = await getAuth().$context;
    const user = await context.internalAdapter.createUser(
      { name: "octo-leaving", email: "octo-leaving@example.test", emailVerified: true, githubLogin: "octo-leaving" },
      { method: "oauth", oauth: { providerId: "github", profile: { login: "octo-leaving" } } },
    );
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "github",
      accountId: "4242",
      accessToken: "gho_secret",
    });
    const session = await context.internalAdapter.createSession(user.id);
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
    expect(await getCurrentUser(new Headers({ host: "localhost:3000", cookie }))).toMatchObject({ id: user.id });
    expect((await traces(user.id)).accounts).toBe(1);

    expect((await deleteRequest(cookie)).status).toBe(200);
    expect(await traces(user.id)).toEqual(NOTHING);
    expect(await getCurrentUser(new Headers({ host: "localhost:3000", cookie }))).toBeNull();
  });

  it("needs a recent GitHub sign-in, and deletes nothing without one", async () => {
    const context = await getAuth().$context;
    const user = await context.internalAdapter.createUser(
      { name: "octo-stale", email: "octo-stale@example.test", emailVerified: true, githubLogin: "octo-stale" },
      { method: "oauth", oauth: { providerId: "github", profile: { login: "octo-stale" } } },
    );
    const session = await context.internalAdapter.createSession(user.id);
    await getPool().query("update auth_sessions set created_at = now() - interval '1 hour' where token = $1", [session.token]);
    const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${await makeSignature(session.token, context.secret)}`;
    expect(await getCurrentUser(new Headers({ host: "localhost:3000", cookie }))).toMatchObject({ id: user.id });

    const response = await deleteRequest(cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reauth: true });
    expect((await traces(user.id)).authUsers).toBe(1);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("a second delete with the old cookie finds no one, and still deletes nothing else", async () => {
    const cookie = await signIn("twice-dev");
    const id = await userIdFor("twice-dev");
    const bystander = await signIn("bystander-dev");
    const bystanderId = await userIdFor("bystander-dev");
    await submitOnce(bystander);
    expect((await deleteRequest(cookie)).status).toBe(200);
    // The dev login's cookie names a login, which no longer exists.
    expect((await deleteRequest(cookie)).status).toBe(401);
    expect(await traces(id)).toEqual(NOTHING);
    expect((await traces(bystanderId)).submissions).toBe(1);
  });

  it("refuses a request from another site, or with no Origin, and deletes nothing", async () => {
    const cookie = await signIn("targeted-dev");
    const id = await userIdFor("targeted-dev");
    for (const origin of ["https://evil.example", "http://localhost:4000", null]) {
      const response = await deleteRequest(cookie, { origin });
      expect(response.status).toBe(403);
    }
    expect((await traces(id)).authUsers).toBe(1);
  });

  it("needs the confirmation in the body", async () => {
    const cookie = await signIn("hesitant-dev");
    const id = await userIdFor("hesitant-dev");
    for (const body of [
      undefined,
      {},
      { confirm: false },
      { confirm: true },
      { confirm: "true" },
      { confirm: "delete" },
      { confirm: " DELETE" },
      { confirm: "DELETE", extra: 1 },
    ]) {
      expect((await deleteRequest(cookie, { body })).status).toBe(400);
    }
    expect((await traces(id)).authUsers).toBe(1);
  });

  it("needs someone signed in", async () => {
    expect((await deleteRequest(undefined)).status).toBe(401);
  });

  it("a deleted user's rate-limit counters don't follow a new account", async () => {
    const cookie = await signIn("limited-dev");
    const id = await userIdFor("limited-dev");
    for (let i = 0; i <= SUBMIT_LIMIT.limit; i++) await isRateLimited(`submit:user:${id}`, SUBMIT_LIMIT);
    expect(await isRateLimited(`submit:user:${id}`, SUBMIT_LIMIT)).toBe(true);
    expect((await deleteRequest(cookie)).status).toBe(200);
    expect((await traces(id)).rateLimits).toBe(0);
  });
});
