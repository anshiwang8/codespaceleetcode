import { describe, expect, it } from "vitest";
import { memoCache } from "@/lib/server/memo-cache";

describe("memoCache", () => {
  it("reuses a value for its lifetime, then loads again", async () => {
    let clock = 0;
    let loads = 0;
    const cache = memoCache(1_000, async () => ++loads, () => clock);
    expect(await cache.get()).toBe(1);
    clock = 999;
    expect(await cache.get()).toBe(1);
    clock = 1_000;
    expect(await cache.get()).toBe(2);
  });

  it("shares one load between callers asking at once", async () => {
    let loads = 0;
    let release!: () => void;
    const cache = memoCache(1_000, async () => {
      loads += 1;
      await new Promise<void>((resolve) => (release = resolve));
      return "value";
    });
    const both = Promise.all([cache.get(), cache.get()]);
    release();
    expect(await both).toEqual(["value", "value"]);
    expect(loads).toBe(1);
  });

  it("doesn't keep a failure, so the next call tries again", async () => {
    let calls = 0;
    const cache = memoCache(1_000, async () => {
      calls += 1;
      if (calls === 1) throw new Error("database down");
      return "back";
    });
    await expect(cache.get()).rejects.toThrow("database down");
    expect(await cache.get()).toBe("back");
  });

  it("never stores a load that started before clear", async () => {
    let version = "old";
    let release!: () => void;
    let gate = true;
    const cache = memoCache(60_000, async () => {
      const seen = version;
      if (gate) await new Promise<void>((resolve) => (release = resolve));
      return seen;
    });
    const stale = cache.get();
    version = "new";
    cache.clear();
    gate = false;
    release();
    expect(await stale).toBe("old");
    expect(await cache.get()).toBe("new");
  });
});
