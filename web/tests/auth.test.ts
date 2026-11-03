import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as loginRoute } from "@/app/api/dev/login/route";
import { POST as logoutRoute } from "@/app/api/dev/logout/route";
import { GET as meRoute } from "@/app/api/me/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import { DEV_COOKIE, isDevAuthAllowed } from "@/lib/server/auth";
import { databaseUrl, getPool } from "@/lib/server/db";
import { CONFIG_FILE, seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, params, signIn } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

const headers = (values: Record<string, string>) => new Headers(values);

describe("isDevAuthAllowed", () => {
  it.each([
    "localhost",
    "localhost:3000",
    "LOCALHOST:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
    "[::1]",
    "[::1]:3000",
  ])("allows the Host %s", (host) => {
    expect(isDevAuthAllowed(headers({ host }))).toBe(true);
  });

  it.each([
    "example.com",
    "example.com:3000",
    "localhost.example.com",
    "localhost:3000.example.com",
    "localhost@example.com",
    "example.com#localhost",
    "127.0.0.1.nip.io",
    "127.0.0.2",
    "0.0.0.0:3000",
    "[::2]:3000",
    "[::ffff:127.0.0.1]",
    "192.168.1.5:3000",
    "localhost:port",
    "localhost, example.com",
    "",
  ])("refuses the Host %j", (host) => {
    expect(isDevAuthAllowed(headers({ host }))).toBe(false);
  });

  it("refuses a request with no Host", () => {
    expect(isDevAuthAllowed(headers({}))).toBe(false);
  });

  it("refuses a local Host in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevAuthAllowed(headers({ host: "localhost:3000" }))).toBe(false);
  });

  it("allows the configured test host, and only that one", () => {
    expect(isDevAuthAllowed(headers({ host: "e2e.test:3000" }))).toBe(false);
    vi.stubEnv("DEV_AUTH_TEST_HOST", "e2e.test");
    expect(isDevAuthAllowed(headers({ host: "e2e.test:3000" }))).toBe(true);
    expect(isDevAuthAllowed(headers({ host: "other.test:3000" }))).toBe(false);
  });

  it("refuses the configured test host in production", () => {
    vi.stubEnv("DEV_AUTH_TEST_HOST", "e2e.test");
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevAuthAllowed(headers({ host: "e2e.test:3000" }))).toBe(false);
  });

  it("refuses a tunnel that rewrites Host but forwards the real one", () => {
    const allowed = isDevAuthAllowed(
      headers({ host: "localhost:3000", "x-forwarded-host": "abc.ngrok.example" }),
    );
    expect(allowed).toBe(false);
  });

  it("allows Next's own local X-Forwarded-Host", () => {
    const allowed = isDevAuthAllowed(
      headers({ host: "localhost:3000", "x-forwarded-host": "localhost:3000" }),
    );
    expect(allowed).toBe(true);
  });

  it.each(["https://evil.example", "null", "not a url"])("refuses the Origin %s", (origin) => {
    expect(isDevAuthAllowed(headers({ host: "localhost:3000", origin }))).toBe(false);
  });

  it("refuses a different local port, which is some other app", () => {
    expect(
      isDevAuthAllowed(headers({ host: "localhost:3000", origin: "http://localhost:5173" })),
    ).toBe(false);
  });

  it("allows a local Origin", () => {
    const allowed = isDevAuthAllowed(
      headers({ host: "localhost:3000", origin: "http://localhost:3000" }),
    );
    expect(allowed).toBe(true);
  });
});

describe("databaseUrl", () => {
  it("defaults to the local database outside production", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("LOCALDB_PORT", "");
    expect(databaseUrl()).toBe("postgres://postgres:postgres@localhost:54329/codebase_puzzles");
  });

  it("follows LOCALDB_PORT, as pnpm db does", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("LOCALDB_PORT", "54400");
    expect(databaseUrl()).toBe("postgres://postgres:postgres@localhost:54400/codebase_puzzles");
  });

  it.each(["0", "70000", "54400x", " "])("rejects LOCALDB_PORT=%j", (port) => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("LOCALDB_PORT", port);
    expect(() => databaseUrl()).toThrow("LOCALDB_PORT");
  });

  it("is an error in production when unset", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => databaseUrl()).toThrow("DATABASE_URL is not set");
  });

  it("uses DATABASE_URL when set", () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    vi.stubEnv("NODE_ENV", "production");
    expect(databaseUrl()).toBe("postgres://example/db");
  });
});

// These return before touching a database, so they run without one.
describe("dev routes when refused", () => {
  const body = { login: "refused-user" };

  it.each([
    ["login", loginRoute],
    ["logout", logoutRoute],
  ])("%s is 404 with no cookie for a non-local Host", async (name, handler) => {
    const request = makeRequest(`/api/dev/${name}`, { host: "example.com", body });
    const response = await handler(request, undefined);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["login", loginRoute],
    ["logout", logoutRoute],
  ])("%s is 404 with no cookie in production", async (name, handler) => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await handler(makeRequest(`/api/dev/${name}`, { body }), undefined);
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("dev login", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  async function countUsers(login: string): Promise<{ users: number; authUsers: number }> {
    const { rows } = await getPool().query<{ users: number; auth_users: number }>(
      `select count(*)::int as users,
              (select count(*)::int from auth.users a join users u on u.id = a.id
                where u.github_login = $1) as auth_users
         from users where github_login = $1`,
      [login],
    );
    return { users: rows[0]?.users ?? -1, authUsers: rows[0]?.auth_users ?? -1 };
  }

  const me = async (cookie?: string, host?: string) =>
    (await meRoute(makeRequest("/api/me", { cookie, host }), undefined)).json();

  it("creates the auth.users and users rows on first use, and reuses them after", async () => {
    await signIn("first-use");
    expect(await countUsers("first-use")).toEqual({ users: 1, authUsers: 1 });
    await signIn("first-use");
    expect(await countUsers("first-use")).toEqual({ users: 1, authUsers: 1 });
  });

  it("creates one user from concurrent first logins", async () => {
    await Promise.all(Array.from({ length: 5 }, () => signIn("first-race")));
    expect(await countUsers("first-race")).toEqual({ users: 1, authUsers: 1 });
  });

  it("creates no user when refused", async () => {
    const refused = makeRequest("/api/dev/login", { host: "example.com", body: { login: "never-made" } });
    await loginRoute(refused, undefined);
    expect(await countUsers("never-made")).toEqual({ users: 0, authUsers: 0 });
  });

  it("sets an HttpOnly, SameSite=Lax cookie", async () => {
    const response = await loginRoute(makeRequest("/api/dev/login", { body: { login: "cookie-check" } }), undefined);
    expect(await response.json()).toEqual({ user: { login: "cookie-check" }, devAuth: true });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${DEV_COOKIE}=cookie-check`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it.each([
    ["a space", { login: "a b" }],
    ["markup", { login: "<script>" }],
    ["a quote", { login: "a'; drop table users; --" }],
    ["a cookie separator", { login: "a;b" }],
    ["too many characters", { login: "x".repeat(40) }],
    ["nothing", { login: "" }],
    ["the wrong type", { login: 5 }],
    ["an extra field", { login: "ok", admin: true }],
    ["no login", {}],
  ])("refuses a login with %s", async (_name, body) => {
    const response = await loginRoute(makeRequest("/api/dev/login", { body }), undefined);
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reports the signed-in user, and whether dev login is available", async () => {
    const cookie = await signIn("me-user");
    expect(await me(cookie)).toEqual({ user: { login: "me-user" }, devAuth: true });
    expect(await me()).toEqual({ user: null, devAuth: true });
    expect(await me(undefined, "example.com")).toEqual({ user: null, devAuth: false });
  });

  it("ignores a dev cookie from a non-local Host", async () => {
    const cookie = await signIn("ignored-host");
    expect(await me(cookie, "example.com")).toEqual({ user: null, devAuth: false });
    const response = await submitRoute(
      makeRequest("/api/puzzles/fx-file/submit", {
        cookie,
        host: "example.com",
        body: { kind: "file", path: CONFIG_FILE },
      }),
      params({ slug: "fx-file" }),
    );
    expect(response.status).toBe(401);
  });

  it("ignores a dev cookie in production", async () => {
    const cookie = await signIn("ignored-prod");
    vi.stubEnv("NODE_ENV", "production");
    expect(await me(cookie)).toEqual({ user: null, devAuth: false });
    const response = await submitRoute(
      makeRequest("/api/puzzles/fx-file/submit", { cookie, body: { kind: "file", path: CONFIG_FILE } }),
      params({ slug: "fx-file" }),
    );
    expect(response.status).toBe(401);
  });

  it.each([
    `${DEV_COOKIE}=no-such-user`,
    `${DEV_COOKIE}=`,
    `${DEV_COOKIE}=a'%20or%201=1`,
    `other_${DEV_COOKIE}=first-use`,
  ])("treats the cookie %s as signed out", async (cookie) => {
    await signIn("first-use");
    expect(await me(cookie)).toEqual({ user: null, devAuth: true });
  });

  it("finds its cookie among others", async () => {
    await signIn("among-others");
    expect(await me(`a=1; ${DEV_COOKIE}=among-others; b=2`)).toMatchObject({ user: { login: "among-others" } });
  });

  it("logout clears the cookie", async () => {
    const response = await logoutRoute(makeRequest("/api/dev/logout", { method: "POST" }), undefined);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null, devAuth: true });
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });
});
