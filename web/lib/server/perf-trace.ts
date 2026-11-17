import "server-only";
import { appendFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";

// Development-only measurement for scripts/perf-measure.mjs. When PERF_TRACE_FILE is set (and the
// server isn't on Vercel), every database query and session lookup appends one JSON line to that
// file: what kind it was, how long it took and the start of its SQL. Nothing else is written: no
// parameters, so no user data reaches the file. PERF_DB_LATENCY_MS adds a fixed delay before each
// query, to stand in for the network between Vercel and the database, and PERF_POOL_MAX sets the
// pool size, so a local run can copy production's pool of 3. All three are ignored without the file.

export function perfTraceFile(): string | null {
  const file = process.env.PERF_TRACE_FILE;
  return file && !process.env.VERCEL ? file : null;
}

function numberSetting(name: string): number | null {
  if (!perfTraceFile()) return null;
  const raw = process.env[name];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** The pool size a measurement run asked for, or null to keep the usual one. */
export function perfPoolMax(): number | null {
  const max = numberSetting("PERF_POOL_MAX");
  return max !== null && max >= 1 ? Math.floor(max) : null;
}

export function traceSpan(kind: string, ms: number, detail = ""): void {
  const file = perfTraceFile();
  if (!file) return;
  appendFileSync(file, `${JSON.stringify({ kind, ms: Math.round(ms * 100) / 100, detail })}\n`);
}

/** Times a piece of work and records it, when tracing is on. Otherwise it just runs the work. */
export async function traced<T>(kind: string, work: () => Promise<T>): Promise<T> {
  if (!perfTraceFile()) return work();
  const started = performance.now();
  try {
    return await work();
  } finally {
    traceSpan(kind, performance.now() - started);
  }
}

type QueryFn = (...args: unknown[]) => unknown;

function sqlOf(first: unknown): string {
  const text = typeof first === "string" ? first : typeof first === "object" && first && "text" in first ? String(first.text) : "";
  return text.replace(/\s+/g, " ").trim().slice(0, 90);
}

/** Wraps each connection's query once, so pool.query, checked-out clients and Better Auth all count. */
export function instrumentPool(pool: Pool): void {
  const delay = numberSetting("PERF_DB_LATENCY_MS") ?? 0;
  pool.on("connect", (client: PoolClient) => {
    const original = client.query.bind(client) as QueryFn;
    const wrapped: QueryFn = (...args) => {
      const started = performance.now();
      const sql = sqlOf(args[0]);
      const done = () => traceSpan("query", performance.now() - started, sql);
      const last = args[args.length - 1];
      if (typeof last === "function") {
        const callback = last as (...result: unknown[]) => void;
        const rest = args.slice(0, -1);
        const run = () =>
          original(...rest, (...result: unknown[]) => {
            done();
            callback(...result);
          });
        if (delay > 0) setTimeout(run, delay);
        else run();
        return undefined;
      }
      const run = async () => {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          return await (original(...args) as Promise<unknown>);
        } finally {
          done();
        }
      };
      return run();
    };
    (client as unknown as { query: QueryFn }).query = wrapped;
  });
}
