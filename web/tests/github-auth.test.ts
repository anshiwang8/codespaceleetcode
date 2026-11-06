import { makeSignature } from "better-auth/crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...all]/route";
import { GET as meRoute } from "@/app/api/me/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import { getCurrentUser } from "@/lib/server/auth";
import { getAuth, withAuth } from "@/lib/server/better-auth";
import { getPool } from "@/lib/server/db";
import { CONFIG_FILE, seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, params } from "./helpers";

const holder = globalThis as typeof globalThis & { codebasesAuth?: unknown };

/** Better Auth reads its options when the instance is built, so env changes need a new one. */
function resetAuth(): void {
  holder.codebasesAuth = undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAuth();
});

/**
 * A user and session made through Better Auth's own adapter, as a GitHub sign-in would leave them,
 * with the session cookie signed the way Better Auth signs it. Writing through the adapter also
 * checks that migration 0005 matches `betterAuthOptions()`.
 */
async function githubSession(login: string, options: { expiresAt?: Date } = {}) {
  const context = await getAuth().$context;
  const user = await context.internalAdapter.createUser({
    name: login,
    email: `${login}@example.test`,
    emailVerified: true,
    githubLogin: login,
  }, { method: "oauth", oauth: { providerId: "github", profile: { login } } });
  const session = await context.internalAdapter.createSession(user.id);
  if (options.expiresAt) {
    await getPool().query("update auth_sessions set expires_at = $1 where token = $2", [
      options.expiresAt,
      session.token,
    ]);
  }
  const signed = `${session.token}.${await makeSignature(session.token, context.secret)}`;
  return { userId: user.id, token: session.token, cookie: `${context.authCookies.sessionToken.name}=${signed}` };
}

const cookieHeaders = (cookie: string) => new Headers({ host: "localhost:3000", cookie });

describe.skipIf(!hasDatabase)("GitHub sign-in through Better Auth", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  it("turns a session into the current user and makes its users row once", async () => {
    const { userId, cookie } = await githubSession("octo-first");
    expect(await getCurrentUser(cookieHeaders(cookie))).toEqual({ id: userId, login: "octo-first", via: "github", sessionCreatedAt: expect.any(Date) });
    expect(await getCurrentUser(cookieHeaders(cookie))).toEqual({ id: userId, login: "octo-first", via: "github", sessionCreatedAt: expect.any(Date) });
    const { rows } = await getPool().query("select id, github_login from users where id = $1", [userId]);
    expect(rows).toEqual([{ id: userId, github_login: "octo-first" }]);
  });

  it("follows a GitHub rename", async () => {
    const { userId, cookie } = await githubSession("octo-before");
    await getCurrentUser(cookieHeaders(cookie));
    await getPool().query("update auth_users set github_login = 'octo-after' where id = $1", [userId]);
    expect(await getCurrentUser(cookieHeaders(cookie))).toMatchObject({ login: "octo-after" });
    const { rows } = await getPool().query("select github_login from users where id = $1", [userId]);
    expect(rows).toEqual([{ github_login: "octo-after" }]);
  });

  it("doesn't let a new account take over a login another user still holds", async () => {
    const first = await githubSession("octo-reused");
    await getCurrentUser(cookieHeaders(first.cookie));
    const second = await githubSession("octo-reused-2");
    await getPool().query("update auth_users set github_login = 'octo-reused' where id = $1", [second.userId]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getCurrentUser(cookieHeaders(second.cookie))).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("octo-reused"));
    const { rows } = await getPool().query("select id from users where github_login = 'octo-reused'");
    expect(rows).toEqual([{ id: first.userId }]);
  });

  it.each([
    ["a tampered signature", (cookie: string) => `${cookie.slice(0, -4)}AAAA`],
    ["an unsigned token", (cookie: string) => cookie.split(".")[0] ?? ""],
    ["no cookie value", (cookie: string) => `${cookie.split("=")[0] ?? ""}=`],
  ])("treats %s as signed out", async (_name, mangle) => {
    const { cookie } = await githubSession(`octo-mangle-${Math.random().toString(16).slice(2, 8)}`);
    expect(await getCurrentUser(cookieHeaders(mangle(cookie)))).toBeNull();
  });

  it("treats an expired session as signed out", async () => {
    const { cookie } = await githubSession("octo-expired", { expiresAt: new Date(Date.now() - 60_000) });
    expect(await getCurrentUser(cookieHeaders(cookie))).toBeNull();
  });

  it("works in production, where the dev login is refused", async () => {
    const { cookie } = await githubSession("octo-prod");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-that-is-at-least-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    // The session was signed with the old instance's secret, so keep that instance.
    expect(await getCurrentUser(cookieHeaders(cookie))).toMatchObject({ login: "octo-prod", via: "github" });
  });

  it("is reported by /api/me, and can submit", async () => {
    const { cookie } = await githubSession("octo-me");
    const me = await (await meRoute(makeRequest("/api/me", { cookie }), undefined)).json();
    expect(me).toEqual({
      user: { login: "octo-me", via: "github", displayName: null, avatarVersion: null, needsEmail: true, appearance: { preference: null, favorites: [] } },
      githubAuth: false,
      devAuth: true,
    });
    const submit = await submitRoute(
      makeRequest("/api/puzzles/fx-file/submit", { cookie, body: { kind: "file", path: CONFIG_FILE } }),
      params({ slug: "fx-file" }),
    );
    expect(submit.status).toBe(200);
    expect(await submit.json()).toMatchObject({ correct: true });
  });

  it("signs out through Better Auth's route, which ends the session", async () => {
    const { cookie, token } = await githubSession("octo-out");
    const response = await authPost(
      makeRequest("/api/auth/sign-out", { cookie, body: {}, headers: { origin: "http://localhost:3000", "content-type": "application/json" } }),
    );
    expect(response.status).toBe(200);
    expect(await getCurrentUser(cookieHeaders(cookie))).toBeNull();
    const { rows } = await getPool().query("select 1 from auth_sessions where token = $1", [token]);
    expect(rows).toEqual([]);
  });

  it("answers the session route for a signed-in user", async () => {
    const { cookie } = await githubSession("octo-session");
    const response = await authGet(makeRequest("/api/auth/get-session", { cookie }));
    expect(await response.json()).toMatchObject({ user: { githubLogin: "octo-session" } });
  });
});

/** The Set-Cookie values of a response, as one Cookie header. */
function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
}

interface FakeGitHubUser {
  id: number;
  login: string;
  /** What /user/emails returns. Empty for an account whose email is private. */
  emails: { email: string; primary: boolean; verified: boolean }[];
}

/**
 * A whole GitHub sign-in through Better Auth's real start and callback routes. Only GitHub's own
 * HTTP API is faked. Returns the session cookie the callback set.
 */
async function signInThroughGitHub(user: FakeGitHubUser): Promise<string> {
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  resetAuth();
  const realFetch = globalThis.fetch;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      return Promise.resolve(json({ access_token: "gho_FAKETOKEN", token_type: "bearer", scope: "read:user,user:email" }));
    }
    if (url === "https://api.github.com/user") {
      return Promise.resolve(json({ id: user.id, login: user.login, name: user.login, email: user.emails[0]?.email ?? null }));
    }
    if (url === "https://api.github.com/user/emails") return Promise.resolve(json(user.emails));
    return realFetch(input, init);
  });

  const start = await authPost(
    makeRequest("/api/auth/sign-in/social", {
      body: { provider: "github", callbackURL: "/puzzles" },
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    }),
  );
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  const callback = await authGet(
    makeRequest(`/api/auth/callback/github?code=fake-code&state=${encodeURIComponent(state)}`, {
      cookie: cookiesFrom(start),
    }),
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/puzzles");
  const session = cookiesFrom(callback)
    .split("; ")
    .filter((cookie) => cookie.startsWith("better-auth.session_token="))
    .join("; ");
  expect(session).not.toBe("");
  return session;
}

describe.skipIf(!hasDatabase)("a real GitHub sign-in", () => {
  beforeAll(async () => {
    await seedFixtures();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs the user in with their GitHub login", async () => {
    const cookie = await signInThroughGitHub({
      id: 4242,
      login: "real-octo",
      emails: [{ email: "real-octo@example.test", primary: true, verified: true }],
    });
    expect(await getCurrentUser(cookieHeaders(cookie))).toMatchObject({ login: "real-octo", via: "github" });
    const { rows } = await getPool().query<{ email: string; github_login: string }>(
      "select u.email, u.github_login from auth_users u join auth_accounts a on a.user_id = u.id where a.account_id = '4242'",
    );
    // The GitHub email isn't kept: the stored one is made from the GitHub id.
    expect(rows).toEqual([{ email: "4242@github-user.invalid", github_login: "real-octo" }]);
  });

  it("signs in an account whose email is private", async () => {
    const cookie = await signInThroughGitHub({ id: 4343, login: "private-octo", emails: [] });
    expect(await getCurrentUser(cookieHeaders(cookie))).toMatchObject({ login: "private-octo" });
  });

  it("follows a GitHub rename on the next sign-in, keeping the same user", async () => {
    const first = await signInThroughGitHub({ id: 4444, login: "renamed-before", emails: [] });
    const before = await getCurrentUser(cookieHeaders(first));
    const second = await signInThroughGitHub({ id: 4444, login: "renamed-after", emails: [] });
    expect(await getCurrentUser(cookieHeaders(second))).toEqual({ id: before?.id, login: "renamed-after", via: "github", sessionCreatedAt: expect.any(Date) });
  });

  it("keeps two GitHub accounts with the same verified email apart", async () => {
    const shared = [{ email: "shared@example.test", primary: true, verified: true }];
    const victim = await signInThroughGitHub({ id: 1001, login: "victim-octo", emails: shared });
    const other = await signInThroughGitHub({ id: 2002, login: "other-octo", emails: shared });
    const victimUser = await getCurrentUser(cookieHeaders(victim));
    const otherUser = await getCurrentUser(cookieHeaders(other));
    expect(victimUser).toMatchObject({ login: "victim-octo" });
    expect(otherUser).toMatchObject({ login: "other-octo" });
    expect(otherUser?.id).not.toBe(victimUser?.id);
  });

  it("stores the GitHub token encrypted, and has no route that hands it out", async () => {
    const cookie = await signInThroughGitHub({ id: 4545, login: "token-octo", emails: [] });
    const { rows } = await getPool().query<{ access_token: string | null }>(
      "select access_token from auth_accounts where account_id = '4545'",
    );
    expect(rows[0]?.access_token).toBeTruthy();
    expect(rows[0]?.access_token).not.toContain("gho_FAKETOKEN");
    const post = { cookie, headers: { origin: "http://localhost:3000", "content-type": "application/json" } };
    for (const path of ["/api/auth/get-access-token", "/api/auth/refresh-token", "/api/auth/account-info"]) {
      const response = await authPost(makeRequest(path, { ...post, body: { providerId: "github" } }));
      expect([404, 405]).toContain(response.status);
      expect(await response.text()).not.toContain("gho_");
    }
    const list = await authGet(makeRequest("/api/auth/list-accounts", { cookie }));
    expect(list.status).toBe(404);
  });

  it("won't let a user set their own GitHub login", async () => {
    const cookie = await signInThroughGitHub({ id: 4646, login: "honest-octo", emails: [] });
    const response = await authPost(
      makeRequest("/api/auth/update-user", {
        cookie,
        body: { githubLogin: "torvalds" },
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(404);
    expect(await getCurrentUser(cookieHeaders(cookie))).toMatchObject({ login: "honest-octo" });
  });
});

describe("production configuration", () => {
  it.each([
    ["BETTER_AUTH_SECRET", { BETTER_AUTH_URL: "https://codebases.example" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_SECRET: "a-test-secret-that-is-at-least-32-characters" }],
  ])("refuses to start without %s", (missing, present) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(missing, "");
    for (const [name, value] of Object.entries(present)) vi.stubEnv(name, value);
    resetAuth();
    expect(() => getAuth()).toThrow(`${missing} is not set`);
  });
});

describe.skipIf(!hasDatabase)("the origin check", () => {
  const signOut = (origin: string, cookie: string) =>
    authPost(
      makeRequest("/api/auth/sign-out", {
        cookie,
        body: {},
        headers: { origin, "content-type": "application/json" },
      }),
    );

  it("refuses a sign-out posted from another site", async () => {
    const { cookie } = await githubSession("octo-csrf");
    const response = await signOut("https://evil.example", cookie);
    expect(response.status).toBe(403);
    expect(await getCurrentUser(cookieHeaders(cookie))).toMatchObject({ login: "octo-csrf" });
  });

  it("refuses a rebinding page whose Origin matches its own non-local Host", async () => {
    const { cookie } = await githubSession("octo-rebind");
    const response = await authPost(
      makeRequest("/api/auth/sign-out", {
        cookie,
        host: "rebind.example:3000",
        body: {},
        headers: { origin: "http://rebind.example:3000", "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("refuses a sign-in that would send the user back to another site", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    resetAuth();
    const response = await authPost(
      makeRequest("/api/auth/sign-in/social", {
        body: { provider: "github", callbackURL: "https://evil.example/steal" },
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("a schema mismatch", () => {
  it("drops the auth instance, so the next request builds one that checks the tables again", async () => {
    const before = getAuth();
    const mismatch = Object.assign(new Error("Database schema mismatch"), { code: "SCHEMA_MISMATCH" });
    await expect(withAuth(() => Promise.reject(mismatch))).rejects.toBe(mismatch);
    expect(getAuth()).not.toBe(before);
  });

  it("keeps the instance for any other error", async () => {
    const before = getAuth();
    await expect(withAuth(() => Promise.reject(new Error("other")))).rejects.toThrow("other");
    expect(getAuth()).toBe(before);
  });
});

describe.skipIf(!hasDatabase)("starting GitHub sign-in", () => {
  const start = () =>
    authPost(
      makeRequest("/api/auth/sign-in/social", {
        body: { provider: "github", callbackURL: "/puzzles" },
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      }),
    );

  it("is refused when no GitHub OAuth app is configured", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    resetAuth();
    const response = await start();
    expect(response.status).toBe(404);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("PROVIDER_NOT_FOUND");
    expect(body).not.toContain("github.com/login/oauth");
  });

  it("sends the browser to GitHub with the app's id, the callback and the email scope", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    resetAuth();
    const response = await start();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; redirect: boolean };
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/github");
    expect(url.searchParams.get("scope")?.split(/[ ,]/)).toContain("user:email");
    // The secret never leaves the server.
    expect(JSON.stringify(body)).not.toContain("test-client-secret");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("test-client-secret");
  });
});
