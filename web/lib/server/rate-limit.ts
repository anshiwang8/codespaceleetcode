import "server-only";
import type { CurrentUser, HeaderReader } from "@/lib/server/auth";

// In memory and per process: serverless instances each keep their own counts, so across a
// deployment the real limit is this one times the number of instances.

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

const MAX_TRACKED_KEYS = 50_000;

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

function makeRoom(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full means many live keys, as with spoofed IPs. Drop the oldest so memory stays bounded.
  for (const key of windows.keys()) {
    if (windows.size < MAX_TRACKED_KEYS) break;
    windows.delete(key);
  }
}

/** Counts this request, and returns true if it's over the limit. */
export function isRateLimited(key: string, { limit, windowMs }: RateLimit, now = Date.now()): boolean {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) makeRoom(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
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

export function resetRateLimits(): void {
  windows.clear();
}
