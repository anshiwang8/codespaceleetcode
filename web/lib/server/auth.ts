import "server-only";
import { headers as nextHeaders } from "next/headers";
import { z } from "zod";
import { getPool, withTransaction } from "@/lib/server/db";

export interface CurrentUser {
  id: string;
  login: string;
}

export type HeaderReader = Pick<Headers, "get">;

/** Swap this implementation for Supabase Auth when GitHub OAuth is built. */
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

function isLocalOrigin(origin: string): boolean {
  try {
    return isLocalHost(new URL(origin).host);
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
  return !origin || isLocalOrigin(origin);
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
    return row ? { id: row.id, login: row.github_login } : null;
  },
};

const provider: AuthProvider = devAuthProvider;

/** Route handlers pass `request.headers`. Server components can leave it out. */
export async function getCurrentUser(headers?: HeaderReader): Promise<CurrentUser | null> {
  return provider.getUser(headers ?? (await nextHeaders()));
}

/** Finds or creates the auth.users and users rows for a dev login. */
export async function devLogin(login: string): Promise<CurrentUser> {
  return withTransaction(async (client) => {
    // Serializes two first logins for the same name, which would otherwise race on the unique key.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`dev-login:${login}`]);
    const existing = await client.query<{ id: string }>(
      "select id from users where github_login = $1",
      [login],
    );
    const found = existing.rows[0];
    if (found) return { id: found.id, login };
    const created = await client.query<{ id: string }>(
      "insert into auth.users default values returning id",
    );
    const id = created.rows[0]?.id;
    if (!id) throw new Error("auth.users insert returned no row");
    await client.query("insert into users (id, github_login) values ($1, $2)", [id, login]);
    return { id, login };
  });
}
