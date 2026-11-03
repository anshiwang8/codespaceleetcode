import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/server/db";
import { seedFixtures } from "./fixtures";
import { hasDatabase, signIn } from "./helpers";

const PERMISSION_DENIED = "42501";

// Each test runs in a transaction under the client role and rolls back, so a denied statement
// can't leak the role or leave anything behind.
describe.skipIf(!hasDatabase)("row-level security", () => {
  let client: PoolClient;

  beforeAll(async () => {
    await seedFixtures();
  });

  beforeEach(async () => {
    client = await getPool().connect();
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
    client.release();
  });

  async function expectDenied(sql: string, values: unknown[] = []): Promise<void> {
    await client.query("savepoint attempt");
    await expect(client.query(sql, values)).rejects.toMatchObject({ code: PERMISSION_DENIED });
    await client.query("rollback to savepoint attempt");
  }

  describe.each(["anon", "authenticated"])("as %s", (role) => {
    beforeEach(async () => {
      await client.query(`set local role ${role}`);
    });

    it("denies puzzles.answer_json", async () => {
      await expectDenied("select answer_json from puzzles");
      await expectDenied("select p.answer_json from puzzles p where p.published");
      await expectDenied("select to_jsonb(p) from puzzles p");
      await expectDenied("select p from puzzles p");
    });

    it("denies select * on puzzles, since it includes the key", async () => {
      await expectDenied("select * from puzzles");
    });

    it("denies filtering on the key, which would let a client probe it", async () => {
      await expectDenied("select slug from puzzles where answer_json is not null");
    });

    it("denies solutions", async () => {
      await expectDenied("select * from solutions");
      await expectDenied("select body_md from solutions");
    });

    it("hides unpublished puzzles", async () => {
      const { rows } = await client.query<{ slug: string }>("select slug from puzzles");
      const slugs = rows.map((row) => row.slug);
      expect(slugs).toContain("fx-symbol");
      expect(slugs).not.toContain("fx-hidden");
      expect(slugs).not.toContain("fx-hidden-repo");
      expect(slugs).toHaveLength(7);
    });

    it("allows the public columns of published puzzles", async () => {
      const { rows } = await client.query(
        `select id, snapshot_id, slug, type, difficulty, title, prompt, answer_kind, set_count,
                choices, hints, tags, verified_by, published
           from puzzles where slug = 'fx-symbol'`,
      );
      expect(rows).toHaveLength(1);
    });

    it("allows reading the code index", async () => {
      for (const table of ["repos", "snapshots", "files", "symbols", "occurrences", "call_edges"]) {
        await client.query(`select count(*) from ${table}`);
      }
    });

    it("denies writes", async () => {
      await expectDenied("update puzzles set published = true");
      await expectDenied("update puzzles set answer_json = '{}'");
      await expectDenied("delete from puzzles");
      await expectDenied("insert into solutions (puzzle_id, body_md) values (1, 'x')");
      await expectDenied("update files set content = ''");
      await expectDenied("insert into progress (user_id, puzzle_id, status) values ($1, 1, 'solved')", [randomUUID()]);
      await expectDenied("insert into submissions (user_id, puzzle_id, answer_json, correct) values ($1, 1, '{}', true)", [randomUUID()]);
      await expectDenied("insert into users (id, github_login) values ($1, 'x')", [randomUUID()]);
    });
  });

  describe("user tables", () => {
    const userId = async (login: string) => {
      const { rows } = await getPool().query<{ id: string }>("select id from users where github_login = $1", [login]);
      return rows[0]?.id ?? "";
    };

    const seedUser = async (login: string) => {
      await signIn(login);
      const id = await userId(login);
      const pool = getPool();
      const puzzle = await pool.query<{ id: string }>("select id from puzzles where slug = 'fx-file'");
      await pool.query(
        "insert into progress (user_id, puzzle_id, status, attempts) values ($1, $2, 'attempted', 1) on conflict do nothing",
        [id, puzzle.rows[0]?.id],
      );
      await pool.query(
        `insert into submissions (user_id, puzzle_id, answer_json, correct) values ($1, $2, '{}', false)`,
        [id, puzzle.rows[0]?.id],
      );
      return id;
    };

    it("denies them to anon", async () => {
      await client.query("set local role anon");
      await expectDenied("select * from users");
      await expectDenied("select * from submissions");
      await expectDenied("select * from progress");
    });

    it("shows an authenticated user only their own rows", async () => {
      const alice = await seedUser("rls-alice");
      await seedUser("rls-bob");
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [alice]);
      for (const [table, column] of [["users", "id"], ["submissions", "user_id"], ["progress", "user_id"]]) {
        const { rows } = await client.query<{ owner: string }>(`select ${column} as owner from ${table}`);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.owner === alice)).toBe(true);
      }
    });

    it("shows an authenticated user with no identity nothing", async () => {
      await seedUser("rls-carol");
      await client.query("set local role authenticated");
      const { rows } = await client.query("select id from users");
      expect(rows).toEqual([]);
    });
  });

  it("lets the service role read the key", async () => {
    await client.query("set local role service_role");
    const { rows } = await client.query("select answer_json from puzzles where slug = 'fx-hidden'");
    expect(rows).toHaveLength(1);
  });

  // Hosted Supabase grants clients everything on a new table in public, and the shim does the same,
  // so a migration that adds a table without locking it down fails here.
  describe("every migration's tables", () => {
    it("start out open to clients, as on hosted Supabase", async () => {
      await client.query("create table rls_probe (id int)");
      const { rows } = await client.query<{ open: boolean }>(
        "select has_table_privilege('anon', 'rls_probe', 'select') as open",
      );
      expect(rows[0]?.open).toBe(true);
    });

    it("have row-level security on", async () => {
      const { rows } = await client.query<{ relname: string }>(
        `select relname from pg_class
          where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity`,
      );
      expect(rows).toEqual([]);
    });

    it("give clients only the reads the migrations grant", async () => {
      const codeIndex = ["call_edges", "files", "occurrences", "repos", "snapshots", "symbols"];
      const { rows } = await client.query<{ grantee: string; table_name: string; privilege_type: string }>(
        `select grantee, table_name, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and grantee in ('anon', 'authenticated')
          order by grantee, table_name, privilege_type`,
      );
      const expected = [
        ...codeIndex.map((table) => ["anon", table]),
        ...[...codeIndex, "progress", "submissions", "users"].sort().map((table) => ["authenticated", table]),
      ].map(([grantee, table_name]) => ({ grantee, table_name, privilege_type: "SELECT" }));
      expect(rows).toEqual(expected);
      // puzzles is readable only column by column, which is what keeps answer_json out.
      const columns = await client.query<{ privilege_type: string }>(
        `select distinct privilege_type from information_schema.column_privileges
          where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
      );
      expect(columns.rows).toEqual([{ privilege_type: "SELECT" }]);
    });

    it("give clients no sequences to advance", async () => {
      const { rows } = await client.query<{ sequence: string }>(
        // Materialized, so has_sequence_privilege only ever sees sequences: the planner may otherwise
        // test it on an index first, which is an error rather than false.
        `with sequences as materialized (
           select oid, relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'S'
         )
         select s.relname as sequence from sequences s, unnest(array['anon', 'authenticated']) as r(role)
          where has_sequence_privilege(r.role, s.oid, 'usage') or has_sequence_privilege(r.role, s.oid, 'update')`,
      );
      expect(rows).toEqual([]);
    });
  });
});
