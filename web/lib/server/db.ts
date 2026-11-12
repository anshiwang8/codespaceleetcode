import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolClient } from "pg";

/** The `pnpm db` port, which scripts/localdb.mjs also reads from LOCALDB_PORT. */
function localDatabasePort(): number {
  const raw = process.env.LOCALDB_PORT;
  if (raw === undefined || raw === "") return 54329;
  const port = /^[0-9]+$/.test(raw) ? Number(raw) : NaN;
  if (!(port >= 1 && port <= 65535)) throw new Error("LOCALDB_PORT must be a port number");
  return port;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set");
  return `postgres://postgres:postgres@localhost:${localDatabasePort()}/codebase_puzzles`;
}

/**
 * True on Vercel's serverless functions. Many instances run at once, each with its own pool, and
 * an instance is frozen between requests, so its idle-connection timers don't fire while frozen.
 */
function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Connections per instance. On Vercel every instance shares Supabase's pooler, whose free plan
 * allows 15 clients in session mode, so each instance keeps few. listPuzzles runs three queries
 * at once, which is the most any request needs.
 */
export const VERCEL_POOL_MAX = 3;
const LOCAL_POOL_MAX = 10;
/** How long an unused connection stays open. Short on Vercel, so a quiet instance gives its back. */
export const VERCEL_IDLE_TIMEOUT_MS = 5_000;

/**
 * Supabase's session pooler (port 5432 on *.pooler.supabase.com) gives each client its own server
 * connection for as long as the client stays connected, so serverless instances use up its 15 slots
 * and every later connection fails with EMAXCONNSESSION. The app belongs on the transaction pooler
 * (port 6543), as spec section 14 M2 says.
 */
export function isSupabaseSessionPooler(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".pooler.supabase.com") && (parsed.port === "" || parsed.port === "5432");
  } catch {
    return false;
  }
}

// Created on first use, because `next build` loads route modules with no database to talk to.
// Kept on globalThis so hot reloads in dev don't each open a new pool.
const holder = globalThis as typeof globalThis & { codebasePuzzlesPool?: Pool };

export function getPool(): Pool {
  if (!holder.codebasePuzzlesPool) {
    const connectionString = databaseUrl();
    const vercel = onVercel();
    if (vercel && isSupabaseSessionPooler(connectionString)) {
      console.warn(
        "[db] DATABASE_URL is Supabase's session pooler (port 5432). Use the transaction pooler (port 6543) so serverless instances don't run out of connections.",
      );
    }
    const pool = new Pool({
      connectionString,
      max: vercel ? VERCEL_POOL_MAX : LOCAL_POOL_MAX,
      idleTimeoutMillis: vercel ? VERCEL_IDLE_TIMEOUT_MS : 10_000,
      connectionTimeoutMillis: 5_000,
      // The transaction pooler ignores this startup setting; it still applies on the direct and
      // session connections and locally.
      statement_timeout: 15_000,
    });
    // Without a listener, an idle connection dropping would crash the process.
    pool.on("error", (error) => console.error("[db] idle connection error:", error.message));
    // Keeps the instance awake after a request until its idle connections have closed, so a frozen
    // instance never holds pooler slots. It does nothing off Vercel.
    if (vercel) attachDatabasePool(pool);
    holder.codebasePuzzlesPool = pool;
  }
  return holder.codebasePuzzlesPool;
}

export async function closePool(): Promise<void> {
  const pool = holder.codebasePuzzlesPool;
  holder.codebasePuzzlesPool = undefined;
  await pool?.end();
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  // Set when the connection can't be trusted any more, so the pool destroys it instead of reusing it.
  let broken: Error | undefined;
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      // Keep the original error: it says what went wrong, and the rollback failing is a symptom.
      broken = rollbackError instanceof Error ? rollbackError : new Error("rollback failed");
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
