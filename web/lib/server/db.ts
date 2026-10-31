import "server-only";
import { Pool, type PoolClient } from "pg";

const LOCAL_DATABASE_URL = "postgres://postgres:postgres@localhost:54329/codebase_puzzles";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set");
  return LOCAL_DATABASE_URL;
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
