import { beforeEach, describe, expect, it } from "vitest";
import { isRateLimited, rateLimitKey, resetRateLimits } from "@/lib/server/rate-limit";

const limit = { limit: 2, windowMs: 1000 };

describe("isRateLimited", () => {
  beforeEach(resetRateLimits);

  it("allows up to the limit, then refuses", () => {
    expect(isRateLimited("a", limit, 0)).toBe(false);
    expect(isRateLimited("a", limit, 1)).toBe(false);
    expect(isRateLimited("a", limit, 2)).toBe(true);
    expect(isRateLimited("a", limit, 3)).toBe(true);
  });

  it("counts keys separately", () => {
    isRateLimited("a", limit, 0);
    isRateLimited("a", limit, 0);
    expect(isRateLimited("b", limit, 0)).toBe(false);
  });

  it("starts over once the window passes", () => {
    isRateLimited("a", limit, 0);
    isRateLimited("a", limit, 0);
    expect(isRateLimited("a", limit, 999)).toBe(true);
    expect(isRateLimited("a", limit, 1000)).toBe(false);
  });

  it("stays working with far more keys than it tracks", () => {
    for (let i = 0; i < 60_000; i++) isRateLimited(`key-${i}`, limit, 0);
    isRateLimited("fresh", limit, 0);
    isRateLimited("fresh", limit, 0);
    expect(isRateLimited("fresh", limit, 0)).toBe(true);
  });
});

describe("rateLimitKey", () => {
  const user = { id: "u1", login: "someone", via: "github" as const };

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
