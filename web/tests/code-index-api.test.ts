import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as searchRoute } from "@/app/api/snapshots/[id]/search/route";
import { GET as outlineRoute } from "@/app/api/snapshots/[id]/symbols/outline/route";
import { GET as symbolsRoute } from "@/app/api/snapshots/[id]/symbols/route";
import type { OutlineResponse, SearchResponse, SymbolAtPositionResponse } from "@/lib/api-types";
import { getPool } from "@/lib/server/db";
import { resetRateLimits, SEARCH_LIMIT } from "@/lib/server/rate-limit";
import { DECOY_RUN, DECOY_STOP, HANDLE_SYMBOL, ROUTER_FILE, seedFixtures, type Fixtures } from "./fixtures";
import { hasDatabase, makeRequest, params, signIn } from "./helpers";

describe.skipIf(!hasDatabase)("snapshot code index", () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await seedFixtures();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  const symbols = (query: string, id: number | string = fixtures.snapshotId) =>
    symbolsRoute(makeRequest(`/api/snapshots/${id}/symbols?${query}`), params({ id: String(id) }));
  const outline = (query: string, id: number | string = fixtures.snapshotId) =>
    outlineRoute(makeRequest(`/api/snapshots/${id}/symbols/outline?${query}`), params({ id: String(id) }));
  const search = (q: string, id: number | string = fixtures.snapshotId, cookie?: string) =>
    searchRoute(
      makeRequest(`/api/snapshots/${id}/search?q=${encodeURIComponent(q)}`, { cookie }),
      params({ id: String(id) }),
    );
  const searchMatches = async (q: string) => {
    const response = await search(q);
    expect(response.status).toBe(200);
    return (await response.json()) as SearchResponse;
  };

  describe("symbols at a position", () => {
    const at = async (file: string, line: number, col: number) => {
      const response = await symbols(`file=${encodeURIComponent(file)}&line=${line}&col=${col}`);
      expect(response.status).toBe(200);
      return (await response.json()) as SymbolAtPositionResponse;
    };

    it("returns the symbol, its definition and its references", async () => {
      expect(await at(ROUTER_FILE, 1, 20)).toEqual({
        symbol: {
          symbolId: HANDLE_SYMBOL,
          name: "KEYTOKEN_handle",
          kind: "function",
          file: ROUTER_FILE,
          startLine: 1,
          endLine: 3,
        },
        definition: { file: ROUTER_FILE, line: 1, col: 17, endCol: 32 },
        references: [{ file: ROUTER_FILE, line: 4, col: 31, endCol: 46 }],
      });
    });

    it("finds the symbol from a reference too", async () => {
      expect((await at(ROUTER_FILE, 4, 35)).symbol?.symbolId).toBe(HANDLE_SYMBOL);
    });

    it("treats col as inclusive and end_col as exclusive", async () => {
      const miss = { symbol: null, definition: null, references: [] };
      expect(await at(ROUTER_FILE, 1, 16)).toEqual(miss);
      expect((await at(ROUTER_FILE, 1, 17)).symbol?.symbolId).toBe(HANDLE_SYMBOL);
      expect((await at(ROUTER_FILE, 1, 31)).symbol?.symbolId).toBe(HANDLE_SYMBOL);
      expect(await at(ROUTER_FILE, 1, 32)).toEqual(miss);
    });

    it("is empty on a line with nothing on it", async () => {
      expect(await at(ROUTER_FILE, 3, 1)).toEqual({ symbol: null, definition: null, references: [] });
    });

    it("prefers the narrowest of overlapping occurrences", async () => {
      expect((await at("src/decoy.ts", 1, 4)).symbol?.symbolId).toBe(DECOY_STOP);
      expect((await at("src/decoy.ts", 1, 8)).symbol?.symbolId).toBe(DECOY_RUN);
    });

    it("has no definition for a symbol with none", async () => {
      expect((await at("src/decoy.ts", 1, 8)).definition).toBeNull();
    });

    it("caps references at 500", async () => {
      const pool = getPool();
      const file = await pool.query<{ file_id: string }>("select file_id from symbols where id = $1", [fixtures.handlePk]);
      await pool.query(
        `insert into occurrences (symbol_pk, file_id, line, col, end_col, role)
         select $1, $2, 1000 + n, 1, 5, 'reference' from generate_series(1, 600) n`,
        [fixtures.handlePk, file.rows[0]?.file_id],
      );
      try {
        expect((await at(ROUTER_FILE, 1, 20)).references).toHaveLength(500);
      } finally {
        await pool.query("delete from occurrences where line > 1000");
      }
    });

    it("doesn't cross into another snapshot with the same path", async () => {
      const response = await symbols(`file=${ROUTER_FILE}&line=1&col=20`, fixtures.otherSnapshotId);
      expect(await response.json()).toEqual({ symbol: null, definition: null, references: [] });
    });

    it.each(["file=src/nope.ts&line=1&col=1", "file=SRC/ROUTER.TS&line=1&col=1"])("404s on %s", async (query) => {
      expect((await symbols(query)).status).toBe(404);
    });

    it.each([
      "line=1&col=1",
      "file=a&col=1",
      "file=a&line=1",
      "file=&line=1&col=1",
      "file=a&line=0&col=1",
      "file=a&line=1&col=0",
      "file=a&line=-1&col=1",
      "file=a&line=1.5&col=1",
      "file=a&line=1e3&col=1",
      "file=a&line=0x10&col=1",
      "file=a&line=abc&col=1",
      "file=a&line=99999999999&col=1",
      "file=a&line=1&col=2147483648",
      "file=a%00b&line=1&col=1",
    ])("400s on %s", async (query) => {
      const response = await symbols(query);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "file, line and col are required" });
    });

    it.each(["999999", "abc", "0", "-1", "1.5", "99999999999999999999", "1;drop"])(
      "404s on the snapshot ID %s",
      async (id) => {
        expect((await symbols("file=a&line=1&col=1", id)).status).toBe(404);
        expect((await outline("file=a", id)).status).toBe(404);
        expect((await search("needle", id)).status).toBe(404);
      },
    );
  });

  describe("outline", () => {
    it("lists a file's symbols in source order", async () => {
      const response = await outline(`file=${ROUTER_FILE}`);
      const body = (await response.json()) as OutlineResponse;
      expect(body.symbols.map((symbol) => [symbol.name, symbol.startLine])).toEqual([
        ["KEYTOKEN_handle", 1],
        ["KEYTOKEN_alias", 4],
        ["KEYTOKEN_step2", 5],
      ]);
    });

    it("is empty for a file with no symbols", async () => {
      expect(await (await outline("file=src/search.txt")).json()).toEqual({ symbols: [] });
    });

    it("doesn't cross into another snapshot with the same path", async () => {
      expect(await (await outline(`file=${ROUTER_FILE}`, fixtures.otherSnapshotId)).json()).toEqual({ symbols: [] });
    });

    it("404s on a missing file and 400s with none given", async () => {
      expect((await outline("file=src/nope.ts")).status).toBe(404);
      expect((await outline("")).status).toBe(400);
    });
  });

  describe("search", () => {
    it("returns file, line and the line's text", async () => {
      expect(await searchMatches("KEYTOKEN_step2();")).toEqual({
        matches: [{ file: ROUTER_FILE, line: 2, text: "  KEYTOKEN_step2();" }],
        truncated: false,
      });
    });

    it("ignores case", async () => {
      expect((await searchMatches("keytoken_STEP2();")).matches).toHaveLength(1);
    });

    it("finds every matching line, ordered by file and line", async () => {
      const { matches } = await searchMatches("KEYTOKEN_handle");
      expect(matches.map((match) => match.line)).toEqual([1, 4]);
    });

    it("numbers CRLF lines as Monaco does, with no stray \\r", async () => {
      expect((await searchMatches("CrLfNeedle")).matches).toEqual([
        { file: "src/decoy.ts", line: 2, text: "second CrLfNeedle line" },
      ]);
    });

    it("treats % as a literal", async () => {
      expect((await searchMatches("100%")).matches.map((match) => match.text)).toEqual(["100% done"]);
    });

    it("treats _ as a literal", async () => {
      expect((await searchMatches("under_")).matches.map((match) => match.text)).toEqual(["under_score"]);
    });

    it("treats a backslash as a literal", async () => {
      expect((await searchMatches("back\\slash")).matches.map((match) => match.text)).toEqual(["back\\slash"]);
      expect((await searchMatches("k\\s")).matches).toHaveLength(1);
      expect((await searchMatches("\\%")).matches).toEqual([]);
    });

    it("runs a query the trigram index can serve", async () => {
      // Which index runs is the planner's call. With the snapshot's path index present it often
      // prefers that one, so this drops it (and rolls back) to show the trigram index still fits.
      const pool = getPool();
      const query = vi.spyOn(pool, "query");
      await search("KEYTOKEN_step2");
      const call = query.mock.calls.map((args) => args as unknown as [string, unknown[]]).at(-1);
      query.mockRestore();
      if (!call) throw new Error("search ran no query");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("alter table files drop constraint files_snapshot_id_path_key");
        await client.query("set local enable_seqscan = off");
        const { rows } = await client.query<{ "QUERY PLAN": string }>(`explain ${call[0]}`, call[1]);
        expect(rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain("files_content_trgm");
      } finally {
        await client.query("rollback");
        client.release();
      }
    });

    it("treats SQL as text", async () => {
      expect(await searchMatches("'; drop table files; --")).toEqual({ matches: [], truncated: false });
      expect((await searchMatches("100%")).matches).toHaveLength(1);
    });

    it("caps at 200 and says so", async () => {
      const { matches, truncated } = await searchMatches("manyneedle");
      expect(matches).toHaveLength(200);
      expect(truncated).toBe(true);
      expect(matches[199]?.line).toBe(200);
    });

    it("doesn't say truncated when the results fit", async () => {
      expect((await searchMatches("manyneedle 25")).truncated).toBe(false);
    });

    it("cuts a very long line short", async () => {
      const { matches } = await searchMatches("longneedle");
      expect(matches[0]?.text).toHaveLength(1000);
    });

    it("doesn't cross into another snapshot", async () => {
      const response = await search("onlyInOtherSnapshot");
      expect(await response.json()).toEqual({ matches: [], truncated: false });
      const other = await search("onlyInOtherSnapshot", fixtures.otherSnapshotId);
      expect(((await other.json()) as SearchResponse).matches).toHaveLength(1);
    });

    it.each([
      ["too short", "a"],
      ["empty", ""],
      ["too long", "x".repeat(201)],
      ["a NUL byte", "a\u0000b"],
    ])("400s on a query that's %s", async (_name, q) => {
      const response = await search(q);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "q must be 2 to 200 characters" });
    });

    it("allows exactly 2 and exactly 200 characters", async () => {
      expect((await search("xx")).status).toBe(200);
      expect((await search("x".repeat(200))).status).toBe(200);
    });

    it("works signed in, and it doesn't need sign-in", async () => {
      expect((await search("KEYTOKEN", fixtures.snapshotId, await signIn("search-user"))).status).toBe(200);
      expect((await search("KEYTOKEN")).status).toBe(200);
    });

    describe("rate limit", () => {
      it("returns 429 past the limit, per client", async () => {
        const from = (ip: string) =>
          searchRoute(
            makeRequest(`/api/snapshots/${fixtures.snapshotId}/search?q=a`, {
              headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
            }),
            params({ id: String(fixtures.snapshotId) }),
          );
        // A one-character query is refused after counting, so this stays out of the database.
        for (let i = 0; i < SEARCH_LIMIT.limit; i++) expect((await from("198.51.100.1")).status).toBe(400);
        expect((await from("198.51.100.1")).status).toBe(429);
        expect((await from("198.51.100.2")).status).toBe(400);
      });

      it("counts by user when signed in, whatever the IP", async () => {
        const cookie = await signIn("search-limited");
        const from = (ip: string) =>
          searchRoute(
            makeRequest(`/api/snapshots/${fixtures.snapshotId}/search?q=a`, {
              cookie,
              headers: { "x-forwarded-for": ip },
            }),
            params({ id: String(fixtures.snapshotId) }),
          );
        for (let i = 0; i < SEARCH_LIMIT.limit; i++) await from(`198.51.100.${i % 200}`);
        expect((await from("203.0.113.9")).status).toBe(429);
      });
    });
  });
});
