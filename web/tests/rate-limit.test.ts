import { beforeEach, describe, expect, it } from "vitest";
import { betterAuthOptions } from "@/lib/server/better-auth";
import { getPool } from "@/lib/server/db";
import {
  consumeAuthRateLimit,
  consumeRateLimit,
  isRateLimited,
  pruneRateLimits,
  rateLimitKey,
  resetRateLimits,
} from "@/lib/server/rate-limit";
import { hasDatabase } from "./helpers";

const limit = { limit: 2, windowMs: 1000 };
const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe.skipIf(!hasDatabase)("isRateLimited, kept in Postgres", () => {
  beforeEach(async () => {
    await resetRateLimits();
  });

  it("allows up to the limit, then refuses", async () => {
    expect(await isRateLimited("a", limit, at(0))).toBe(false);
    expect(await isRateLimited("a", limit, at(1))).toBe(false);
    expect(await isRateLimited("a", limit, at(2))).toBe(true);
    expect(await isRateLimited("a", limit, at(3))).toBe(true);
  });

  it("counts keys separately", async () => {
    await isRateLimited("a", limit, at(0));
    await isRateLimited("a", limit, at(0));
    expect(await isRateLimited("b", limit, at(0))).toBe(false);
  });

  it("starts over once the window passes", async () => {
    await isRateLimited("a", limit, at(0));
    await isRateLimited("a", limit, at(0));
    expect(await isRateLimited("a", limit, at(999))).toBe(true);
    expect(await isRateLimited("a", limit, at(1000))).toBe(false);
    expect(await isRateLimited("a", limit, at(1001))).toBe(false);
    expect(await isRateLimited("a", limit, at(1002))).toBe(true);
  });

  it("says how long until the window ends", async () => {
    await consumeRateLimit("a", { limit: 1, windowMs: 60_000 }, at(0));
    const result = await consumeRateLimit("a", { limit: 1, windowMs: 60_000 }, at(15_500));
    expect(result).toEqual({ limited: true, retryAfterSeconds: 45 });
  });

  it("lets exactly the limit through when requests arrive at once, as from many instances", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => isRateLimited("burst", { limit: 5, windowMs: 60_000 })),
    );
    expect(results.filter((limited) => !limited)).toHaveLength(5);
  });

  it("uses the database's clock when no time is given", async () => {
    expect(await isRateLimited("live", { limit: 1, windowMs: 60_000 })).toBe(false);
    expect(await isRateLimited("live", { limit: 1, windowMs: 60_000 })).toBe(true);
  });

  it("refuses a window longer than pruning keeps rows for", async () => {
    await expect(consumeRateLimit("a", { limit: 1, windowMs: 2 * 60 * 60_000 })).rejects.toThrow(/out of range/);
    await expect(consumeRateLimit("a", { limit: 1, windowMs: 0 })).rejects.toThrow(/out of range/);
  });

  it("prunes only windows that ended long ago", async () => {
    await isRateLimited("old", limit, at(0));
    await isRateLimited("recent", limit, at(59 * 60_000));
    expect(await pruneRateLimits(at(61 * 60_000))).toBe(1);
    const { rows } = await getPool().query<{ key: string }>("select key from rate_limits");
    expect(rows.map((row) => row.key)).toEqual(["recent"]);
  });

  it("keeps very long keys to a bounded size", async () => {
    await isRateLimited("k".repeat(5000), limit, at(0));
    const { rows } = await getPool().query<{ length: number }>("select length(key) as length from rate_limits");
    expect(rows[0]?.length).toBe(200);
  });

  it("serves Better Auth's limiter from the same table, under its own prefix", async () => {
    expect(await consumeAuthRateLimit("1.2.3.4|/sign-in/social", { window: 10, max: 1 })).toEqual({
      allowed: true,
      retryAfter: null,
    });
    const second = await consumeAuthRateLimit("1.2.3.4|/sign-in/social", { window: 10, max: 1 });
    expect(second.allowed).toBe(false);
    expect(second.retryAfter).toBeGreaterThanOrEqual(1);
    expect(second.retryAfter).toBeLessThanOrEqual(10);
    const { rows } = await getPool().query<{ key: string }>("select key from rate_limits");
    expect(rows.map((row) => row.key)).toEqual(["auth:1.2.3.4|/sign-in/social"]);
  });

  it("is what Better Auth is configured with", () => {
    expect(betterAuthOptions().rateLimit.customStorage.consume).toBe(consumeAuthRateLimit);
  });
});

describe("rateLimitKey", () => {
  const user = { id: "u1", login: "someone", via: "github" as const, sessionCreatedAt: null };

  it("prefers the user", () => {
    expect(rateLimitKey(user, new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("user:u1");
  });

  it("falls back to the IP the nearest proxy added, which is the last one", () => {
    expect(rateLimitKey(null, new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("ip:198.51.100.1");
    expect(rateLimitKey(null, new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.7" }))).toBe("ip:203.0.113.7");
  });

  it("can't be steered by entries the client wrote first", () => {
    const real = "203.0.113.7";
    const keys = ["1.1.1.1", "2.2.2.2", "unknown", ""].map((fake) =>
      rateLimitKey(null, new Headers({ "x-forwarded-for": `${fake}, ${real}` })),
    );
    expect(new Set(keys)).toEqual(new Set([`ip:${real}`]));
  });

  it("shares one bucket when there's no IP to go on", () => {
    expect(rateLimitKey(null, new Headers())).toBe("ip:unknown");
  });
});
