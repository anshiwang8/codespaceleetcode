import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
  VERCEL_IDLE_TIMEOUT_MS,
  VERCEL_POOL_MAX,
  getPool,
  isSupabaseSessionPooler,
  withTransaction,
} from "@/lib/server/db";
import { readJson } from "@/lib/server/http";

const MAX_BODY_BYTES = 256 * 1024;

describe("withTransaction", () => {
  const holder = globalThis as typeof globalThis & { codebasePuzzlesPool?: Pool };
  let saved: Pool | undefined;

  afterEach(() => {
    holder.codebasePuzzlesPool = saved;
  });

  /** A pool whose one client records its queries and how it was released. */
  function fakePool(failRollback: boolean) {
    const log: { queries: string[]; released: unknown[] } = { queries: [], released: [] };
    const client = {
      query: async (sql: string) => {
        log.queries.push(sql);
        if (sql === "rollback" && failRollback) throw new Error("connection terminated");
        return { rows: [] };
      },
      release: (error?: unknown) => {
        log.released.push(error);
      },
    };
    saved = holder.codebasePuzzlesPool;
    holder.codebasePuzzlesPool = { connect: async () => client } as unknown as Pool;
    return log;
  }

  it("rolls back and rethrows the work's own error", async () => {
    const log = fakePool(false);
    await expect(
      withTransaction(async () => {
        throw new Error("the real problem");
      }),
    ).rejects.toThrow("the real problem");
    expect(log.queries).toEqual(["begin", "rollback"]);
    expect(log.released).toEqual([undefined]);
  });

  it("keeps the work's error when the rollback also fails, and drops the connection", async () => {
    const log = fakePool(true);
    await expect(
      withTransaction(async () => {
        throw new Error("the real problem");
      }),
    ).rejects.toThrow("the real problem");
    // A truthy argument tells pg to destroy the client rather than reuse it.
    expect(log.released).toHaveLength(1);
    expect(log.released[0]).toBeInstanceOf(Error);
  });
});

describe("readJson", () => {
  /** A request with a streamed body and no Content-Length, counting how many chunks were read. */
  function streamed(chunks: Uint8Array[]) {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[pulled];
        pulled += 1;
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const request = new Request("http://127.0.0.1/api", { method: "POST", body, duplex: "half" } as RequestInit);
    return { request, pulled: () => pulled };
  }

  it("parses a small body", async () => {
    const { request } = streamed([new TextEncoder().encode('{"a":1}')]);
    expect(await readJson(request)).toEqual({ a: 1 });
  });

  it("stops reading a streamed body once it passes the limit", async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x20);
    const { request, pulled } = streamed(Array.from({ length: 100 }, () => chunk));
    expect(await readJson(request)).toBeUndefined();
    expect(pulled()).toBeLessThan(10);
  });

  it("counts bytes, not characters", async () => {
    // 200k two-byte characters: under the limit as a string, over it in bytes.
    const json = JSON.stringify("é".repeat(200_000));
    expect(json.length).toBeLessThan(MAX_BODY_BYTES);
    const { request } = streamed([new TextEncoder().encode(json)]);
    expect(await readJson(request)).toBeUndefined();
  });

  it("accepts a body of exactly the limit", async () => {
    const json = JSON.stringify("a".repeat(MAX_BODY_BYTES - 2));
    const { request } = streamed([new TextEncoder().encode(json)]);
    expect(await readJson(request)).toHaveLength(MAX_BODY_BYTES - 2);
  });

  it("still refuses a declared Content-Length over the limit without reading", async () => {
    const { request } = streamed([new TextEncoder().encode("{}")]);
    const declared = new Request(request, { headers: { "content-length": String(MAX_BODY_BYTES + 1) } });
    expect(await readJson(declared)).toBeUndefined();
    expect(declared.bodyUsed).toBe(false);
  });
});

describe("getPool", () => {
  const holder = globalThis as typeof globalThis & { codebasePuzzlesPool?: Pool };

  it("keeps few, short-lived connections per instance on Vercel", async () => {
    const saved = holder.codebasePuzzlesPool;
    const savedVercel = process.env.VERCEL;
    holder.codebasePuzzlesPool = undefined;
    process.env.VERCEL = "1";
    try {
      const pool = getPool();
      expect(pool.options.max).toBe(VERCEL_POOL_MAX);
      expect(pool.options.idleTimeoutMillis).toBe(VERCEL_IDLE_TIMEOUT_MS);
      await pool.end();
    } finally {
      holder.codebasePuzzlesPool = saved;
      if (savedVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = savedVercel;
    }
  });
});

describe("isSupabaseSessionPooler", () => {
  it("flags the session pooler, which serverless instances run out of", () => {
    expect(isSupabaseSessionPooler("postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres")).toBe(true);
    expect(isSupabaseSessionPooler("postgresql://u:p@aws-0-us-east-1.pooler.supabase.com/postgres")).toBe(true);
  });

  it("accepts the transaction pooler, the direct connection and local databases", () => {
    expect(isSupabaseSessionPooler("postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe(false);
    expect(isSupabaseSessionPooler("postgresql://u:p@db.abc.supabase.co:5432/postgres")).toBe(false);
    expect(isSupabaseSessionPooler("postgres://postgres:postgres@localhost:54329/codebase_puzzles")).toBe(false);
    expect(isSupabaseSessionPooler("not a url")).toBe(false);
  });
});
