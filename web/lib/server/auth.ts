import "server-only";
import { headers as nextHeaders } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { withAuth } from "@/lib/server/better-auth";
import { getPool, withTransaction } from "@/lib/server/db";
import { traced } from "@/lib/server/perf-trace";

export interface CurrentUser {
  id: string;
  login: string;
  /** How this session was made: a real GitHub sign-in, or the localhost dev login. */
  via: "github" | "dev";
  /** When this GitHub session began, for checks that need a recent sign-in. Null for dev logins. */
  sessionCreatedAt: Date | null;
}

export type HeaderReader = Pick<Headers, "get">;

export interface AuthProvider {
  getUser(headers: HeaderReader): Promise<CurrentUser | null>;
}

export const DEV_COOKIE = "cp_dev_login";
export const DEV_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const devLoginSchema = z.strictObject({
  login: z.string().regex(/^[A-Za-z0-9_-]{1,39}$/),
});

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The name in a Host-style `name[:port]` value. Anything unusual is null, so it's refused. */
function hostnameOf(host: string): string | null {
  const match = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/.exec(host.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function isLocalHost(host: string): boolean {
  const hostname = hostnameOf(host);
  if (!hostname) return false;
  return LOCAL_HOSTNAMES.has(hostname) || hostname === process.env.DEV_AUTH_TEST_HOST?.toLowerCase();
}

/** Another app on a different local port isn't this site, so it can't use the dev session. */
function isSameOrigin(origin: string, host: string): boolean {
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Whether the dev login may be used for this request. A route handler can't see the peer's
 * address, so this reads headers: the NODE_ENV check is what actually protects a deployment.
 * X-Forwarded-Host catches a tunnel or proxy that rewrites Host to localhost.
 */
export function isDevAuthAllowed(headers: HeaderReader): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const host = headers.get("host");
  if (!host || !isLocalHost(host)) return false;
  const forwarded = headers.get("x-forwarded-host");
  if (forwarded && !forwarded.split(",").every(isLocalHost)) return false;
  const origin = headers.get("origin");
  return !origin || isSameOrigin(origin, host);
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

// The cookie is the login itself, unsigned. Dev login has no password, so signing it would add
// nothing: anyone who can reach this code path can already sign in as anyone.
const devAuthProvider: AuthProvider = {
  async getUser(headers) {
    if (!isDevAuthAllowed(headers)) return null;
    const cookie = readCookie(headers.get("cookie"), DEV_COOKIE);
    const parsed = devLoginSchema.shape.login.safeParse(cookie);
    if (!parsed.success) return null;
    const { rows } = await getPool().query<{ id: string; github_login: string }>(
      "select id, github_login from users where github_login = $1",
      [parsed.data],
    );
    const row = rows[0];
    return row ? { id: row.id, login: row.github_login, via: "dev", sessionCreatedAt: null } : null;
  },
};

const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/**
 * Which users rows this server instance has already seen in step with their session's GitHub
 * login, so the upsert below runs once per user per instance instead of on every request. It
 * holds only an id and a login, decides nothing about who is signed in (Better Auth's session
 * lookup does that, on every request), and is consulted only after that lookup has returned this
 * same user. An entry is trusted for SYNC_TTL_MS; a different login always runs the upsert again.
 */
const SYNC_TTL_MS = 5 * 60_000;
const SYNC_MAX_ENTRIES = 5_000;
const syncHolder = globalThis as typeof globalThis & { codebasesUserSync?: Map<string, { login: string; at: number }> };
const synced = (syncHolder.codebasesUserSync ??= new Map());

function isSynced(id: string, login: string, now: number): boolean {
  const entry = synced.get(id);
  return entry !== undefined && entry.login === login && now - entry.at < SYNC_TTL_MS;
}

function markSynced(id: string, login: string, now: number): void {
  synced.delete(id);
  // Oldest first, since a Map keeps insertion order.
  while (synced.size >= SYNC_MAX_ENTRIES) {
    const oldest = synced.keys().next().value;
    if (oldest === undefined) break;
    synced.delete(oldest);
  }
  synced.set(id, { login, at: now });
}

/** Tests only: forget every synced user, as a fresh server instance would. */
export function forgetSyncedUsersForTests(): void {
  synced.clear();
}

/**
 * A Better Auth session from a GitHub sign-in. The `users` row that submissions and progress
 * point at is made here, on the first request after sign-up, and its login follows GitHub renames.
 * Once an instance has done that for a user and login, it skips the upsert for SYNC_TTL_MS.
 */
export const githubAuthProvider: AuthProvider = {
  async getUser(headers) {
    const cookie = headers.get("cookie");
    // Without a cookie there's no session, so skip the lookup.
    if (!cookie) return null;
    const session = await withAuth((auth) => auth.api.getSession({ headers: new Headers({ cookie }) }));
    if (!session) return null;
    const login = session.user.githubLogin;
    if (typeof login !== "string" || !GITHUB_LOGIN.test(login)) return null;
    const now = Date.now();
    if (!isSynced(session.user.id, login, now)) {
      try {
        await getPool().query(
          `insert into users (id, github_login) values ($1, $2)
           on conflict (id) do update set github_login = excluded.github_login
             where users.github_login <> excluded.github_login`,
          [session.user.id, login],
        );
      } catch (error) {
        // GitHub frees a login when its owner renames, so another account can hold it here. That
        // user stays signed out until the old row is renamed, rather than taking over its progress.
        if (isUniqueViolation(error)) {
          console.error(`[auth] GitHub login ${login} already belongs to another user`);
          return null;
        }
        throw error;
      }
      markSynced(session.user.id, login, now);
    }
    return { id: session.user.id, login, via: "github", sessionCreatedAt: new Date(session.session.createdAt) };
  },
};

async function resolveUser(source: HeaderReader): Promise<CurrentUser | null> {
  // A real session wins. The dev login is only a stand-in, and only where it's allowed.
  return traced("auth", async () => (await githubAuthProvider.getUser(source)) ?? (await devAuthProvider.getUser(source)));
}

/**
 * Once per server render: a page, its layout and its metadata asking for the user share one
 * session lookup. React's cache lasts only for this one request, so nothing carries between
 * requests or people. Route handlers pass their headers and look the session up themselves.
 */
const userForRender = cache(async () => resolveUser(await nextHeaders()));

/** Route handlers pass `request.headers`. Server components can leave it out. */
export async function getCurrentUser(headers?: HeaderReader): Promise<CurrentUser | null> {
  return headers ? resolveUser(headers) : userForRender();
}

/** Finds or creates the auth_users and users rows for a dev login. */
export async function devLogin(login: string): Promise<CurrentUser> {
  return withTransaction(async (client) => {
    // Serializes two first logins for the same name, which would otherwise race on the unique key.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`dev-login:${login}`]);
    const existing = await client.query<{ id: string }>(
      "select id from users where github_login = $1",
      [login],
    );
    const found = existing.rows[0];
    if (found) return { id: found.id, login, via: "dev", sessionCreatedAt: null };
    // Dev users have no email, so they get a placeholder on a reserved domain, as in migration 0005.
    const created = await client.query<{ id: string }>(
      `insert into auth_users (name, email, email_verified, github_login)
       values ($1, gen_random_uuid()::text || '@dev-login.invalid', false, $1) returning id`,
      [login],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new Error("auth_users insert returned no row");
    await client.query("insert into users (id, github_login) values ($1, $2)", [id, login]);
    return { id, login, via: "dev", sessionCreatedAt: null };
  });
}
