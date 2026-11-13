import "server-only";
import { headers as nextHeaders } from "next/headers";
import type { CurrentUser, HeaderReader } from "@/lib/server/auth";
import { getPool } from "@/lib/server/db";

// Counts live in Postgres (migration 0006), so every serverless instance shares them. Each key has
// a fixed window that starts at its first request. One upsert counts the request and resets an
// expired window, so concurrent requests can't both slip under the limit. Time is the database's
// clock, which every instance agrees on.

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export const SUBMIT_LIMIT: RateLimit = { limit: 60, windowMs: 60_000 };
export const SEARCH_LIMIT: RateLimit = { limit: 240, windowMs: 60_000 };
/**
 * Queries under 3 characters can't use the trigram index, so a rare one scans every file in the
 * snapshot: about 400 ms on the largest (20 MB), against about 15 ms for a rare 4-letter query.
 * Search is debounced as you type, so a person sends about one per word.
 */
export const SHORT_SEARCH_LIMIT: RateLimit = { limit: 30, windowMs: 60_000 };
export const SHORT_SEARCH_CHARS = 3;
/** Revealing hints: a person reads each one, so this is generous and only stops scripts. */
export const HINT_LIMIT: RateLimit = { limit: 30, windowMs: 60_000 };
/** Leaderboard and challenge reads, which aggregate over many rows. */
export const BOARD_LIMIT: RateLimit = { limit: 120, windowMs: 60_000 };
/** Signed-in Learn checks, which write progress. Guests' checks touch no database and aren't counted. */
export const LEARN_CHECK_LIMIT: RateLimit = { limit: 120, windowMs: 60_000 };
/** Joining, renaming or leaving the leaderboard. */
export const LEADERBOARD_CHANGE_LIMIT: RateLimit = { limit: 20, windowMs: 60 * 60_000 };
/** Account deletion attempts, which each check a recent sign-in. */
export const DELETE_ACCOUNT_LIMIT: RateLimit = { limit: 10, windowMs: 60 * 60_000 };

/** Rows whose window started longer ago than this are deleted. Every window must be shorter. */
const MAX_WINDOW_MS = 60 * 60_000;
/** About one request in this many also prunes expired rows, so the table stays small. */
const PRUNE_EVERY = 100;
const MAX_KEY_LENGTH = 200;

export interface RateLimitResult {
  limited: boolean;
  /** Seconds until this key's window ends. */
  retryAfterSeconds: number;
}

const CONSUME_SQL = `
  insert into rate_limits as r (key, count, window_start)
  values ($1, 1, coalesce($3::timestamptz, now()))
  on conflict (key) do update set
    count = case
      when r.window_start <= excluded.window_start - $2::double precision * interval '1 millisecond' then 1
      else r.count + 1
    end,
    window_start = case
      when r.window_start <= excluded.window_start - $2::double precision * interval '1 millisecond'
        then excluded.window_start
      else r.window_start
    end
  returning
    count,
    extract(epoch from window_start - coalesce($3::timestamptz, now())) * 1000 + $2::double precision
      as remaining_ms`;

/**
 * Counts this request against `key`. `now` is for tests; otherwise the database's clock is used.
 */
export async function consumeRateLimit(
  key: string,
  { limit, windowMs }: RateLimit,
  now?: Date,
): Promise<RateLimitResult> {
  if (!(windowMs > 0 && windowMs <= MAX_WINDOW_MS)) throw new Error(`Rate limit window out of range: ${windowMs}`);
  const pool = getPool();
  const { rows } = await pool.query<{ count: number; remaining_ms: number | string }>(CONSUME_SQL, [
    key.slice(0, MAX_KEY_LENGTH),
    windowMs,
    now ?? null,
  ]);
  const row = rows[0];
  if (!row) throw new Error("Rate limit upsert returned no row");
  if (Math.random() * PRUNE_EVERY < 1) {
    // Housekeeping only: a failure here must not fail the request that triggered it.
    // It uses the same clock as this request, so a test's fixed time never prunes its own rows.
    await pruneRateLimits(now).catch(() => undefined);
  }
  return {
    limited: row.count > limit,
    retryAfterSeconds: Math.max(1, Math.ceil(Number(row.remaining_ms) / 1000)),
  };
}

/** Counts this request, and returns true if it's over the limit. */
export async function isRateLimited(key: string, limit: RateLimit, now?: Date): Promise<boolean> {
  return (await consumeRateLimit(key, limit, now)).limited;
}

/** Deletes rows whose window ended long ago. Returns how many went. */
export async function pruneRateLimits(now?: Date): Promise<number> {
  const result = await getPool().query(
    "delete from rate_limits where window_start < coalesce($1::timestamptz, now()) - $2::double precision * interval '1 millisecond'",
    [now ?? null, MAX_WINDOW_MS],
  );
  return result.rowCount ?? 0;
}

/**
 * Better Auth's limiter, stored in the same table under an `auth:` prefix. Better Auth gives
 * windows in seconds and wants to know when to retry.
 */
export async function consumeAuthRateLimit(
  key: string,
  rule: { window: number; max: number },
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const result = await consumeRateLimit(`auth:${key}`, { limit: rule.max, windowMs: rule.window * 1000 });
  return { allowed: !result.limited, retryAfter: result.limited ? result.retryAfterSeconds : null };
}

/**
 * The signed-in user, or else the client IP. A proxy appends the address it saw to
 * X-Forwarded-For, after anything the client sent, so only the last entry can be trusted. Vercel
 * replaces the header with the client's address alone, which is also the last entry. With no
 * proxy, as on localhost, there's no header and every signed-out client shares one bucket.
 */
export function rateLimitKey(user: CurrentUser | null, headers: HeaderReader): string {
  if (user) return `user:${user.id}`;
  const ip = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim().slice(0, 64);
  return `ip:${ip || "unknown"}`;
}

/**
 * For server-rendered pages that aggregate over many rows (the leaderboard, challenges): the same
 * budget as their API routes, so reloading a page can't do what the API refuses.
 */
export async function isPageRateLimited(user: CurrentUser | null): Promise<boolean> {
  return isRateLimited(`board:${rateLimitKey(user, await nextHeaders())}`, BOARD_LIMIT);
}

/** Tests only: forgets every count. */
export async function resetRateLimits(): Promise<void> {
  await getPool().query("delete from rate_limits");
}
