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

/** The signed-in user, or else the client IP. */
export function rateLimitKey(user: CurrentUser | null, headers: HeaderReader): string {
  if (user) return `user:${user.id}`;
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64);
  return `ip:${ip || "unknown"}`;
}

export function resetRateLimits(): void {
  windows.clear();
}
