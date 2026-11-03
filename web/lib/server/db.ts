import "server-only";
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

// Created on first use, because `next build` loads route modules with no database to talk to.
// Kept on globalThis so hot reloads in dev don't each open a new pool.
const holder = globalThis as typeof globalThis & { codebasePuzzlesPool?: Pool };

export function getPool(): Pool {
  if (!holder.codebasePuzzlesPool) {
    const pool = new Pool({
      connectionString: databaseUrl(),
      max: 10,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
    });
    // Without a listener, an idle connection dropping would crash the process.
    pool.on("error", (error) => console.error("[db] idle connection error:", error.message));
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
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
