import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as detailRoute } from "@/app/api/puzzles/[slug]/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import type { PuzzleDetail } from "@/lib/api-types";
import { getPool } from "@/lib/server/db";
import { resetRateLimits, SUBMIT_LIMIT } from "@/lib/server/rate-limit";
import {
  ALIAS_SYMBOL,
  CONFIG_FILE,
  DECOY_RUN,
  HANDLE_SYMBOL,
  OTHER_SNAPSHOT_SYMBOL,
  ROUTER_FILE,
  seedFixtures,
  STEP_SYMBOL,
} from "./fixtures";
import { expectNoAnswerData, hasDatabase, makeRequest, params, signIn } from "./helpers";

function submit(slug: string, cookie: string | undefined, body: unknown): Promise<Response> {
  return submitRoute(makeRequest(`/api/puzzles/${slug}/submit`, { cookie, body }), params({ slug }));
}

async function detail(slug: string, cookie: string): Promise<PuzzleDetail> {
  const response = await detailRoute(makeRequest(`/api/puzzles/${slug}`, { cookie }), params({ slug }));
  return (await response.json()) as PuzzleDetail;
}

async function progressRow(login: string, slug: string) {
  const { rows } = await getPool().query<{
    status: string;
    attempts: number;
    solved_at: Date | null;
  }>(
    `select pr.status, pr.attempts, pr.solved_at
       from progress pr
       join users u on u.id = pr.user_id
       join puzzles p on p.id = pr.puzzle_id
      where u.github_login = $1 and p.slug = $2`,
    [login, slug],
  );
  return rows[0] ?? null;
}

async function submissionRows(login: string) {
  const { rows } = await getPool().query<{
    answer_json: unknown;
    correct: boolean;
    time_on_puzzle_ms: number | null;
  }>(
    `select s.answer_json, s.correct, s.time_on_puzzle_ms
       from submissions s
       join users u on u.id = s.user_id
      where u.github_login = $1
      order by s.id`,
    [login],
  );
  return rows;
}

const correctAnswers: [string, unknown][] = [
  ["fx-symbol", { kind: "symbol", id: HANDLE_SYMBOL }],
  ["fx-file", { kind: "file", path: CONFIG_FILE }],
  ["fx-location", { kind: "location", id: `${CONFIG_FILE}:L2-L8` }],
  ["fx-sequence", { kind: "sequence", ids: [HANDLE_SYMBOL, STEP_SYMBOL] }],
  ["fx-set", { kind: "set", ids: [HANDLE_SYMBOL, CONFIG_FILE] }],
  ["fx-choice", { kind: "choice", option: "opt-b" }],
];

const wrongAnswers: [string, string, unknown][] = [
  ["fx-symbol", "another symbol", { kind: "symbol", id: DECOY_RUN }],
  ["fx-file", "another file", { kind: "file", path: ROUTER_FILE }],
  ["fx-location", "a real span in the wrong file", { kind: "location", id: `${ROUTER_FILE}:L1-L4` }],
  ["fx-location", "the anchor not covered", { kind: "location", id: `${CONFIG_FILE}:L4-L8` }],
  ["fx-location", "outside the window", { kind: "location", id: `${CONFIG_FILE}:L1-L8` }],
  ["fx-sequence", "the wrong order", { kind: "sequence", ids: [STEP_SYMBOL, HANDLE_SYMBOL] }],
  ["fx-sequence", "a missing step", { kind: "sequence", ids: [HANDLE_SYMBOL] }],
  ["fx-set", "a missing member", { kind: "set", ids: [HANDLE_SYMBOL] }],
  ["fx-set", "an extra member", { kind: "set", ids: [HANDLE_SYMBOL, CONFIG_FILE, ROUTER_FILE] }],
  ["fx-set", "a duplicate", { kind: "set", ids: [HANDLE_SYMBOL, HANDLE_SYMBOL] }],
  ["fx-choice", "another option", { kind: "choice", option: "opt-a" }],
];

// Each of these names something that isn't in the puzzle's snapshot.
const unknownReferences: [string, string, unknown][] = [
  ["fx-symbol", "an ID that isn't there", { kind: "symbol", id: "src/router.ts#NoSuchSymbol" }],
  ["fx-symbol", "the key in the wrong case", { kind: "symbol", id: HANDLE_SYMBOL.toLowerCase() }],
  ["fx-symbol", "a symbol from another snapshot", { kind: "symbol", id: OTHER_SNAPSHOT_SYMBOL }],
  ["fx-symbol", "a file path as a symbol", { kind: "symbol", id: ROUTER_FILE }],
  ["fx-file", "a file that isn't there", { kind: "file", path: "src/nope.ts" }],
  ["fx-file", "the key in the wrong case", { kind: "file", path: CONFIG_FILE.toLowerCase() }],
  ["fx-file", "a file from another snapshot", { kind: "file", path: "lib/other.ts" }],
  ["fx-file", "a symbol as a file", { kind: "file", path: HANDLE_SYMBOL }],
  ["fx-location", "a file that isn't there", { kind: "location", id: "src/nope.ts:L1-L2" }],
  ["fx-location", "a span past the end of the file", { kind: "location", id: `${CONFIG_FILE}:L3-L12` }],
  ["fx-location", "a malformed span", { kind: "location", id: `${CONFIG_FILE}:L3` }],
  ["fx-location", "line zero", { kind: "location", id: `${CONFIG_FILE}:L0-L4` }],
  ["fx-location", "a backward span", { kind: "location", id: `${CONFIG_FILE}:L4-L3` }],
  ["fx-location", "a bare path", { kind: "location", id: CONFIG_FILE }],
  ["fx-sequence", "one unknown step", { kind: "sequence", ids: [HANDLE_SYMBOL, "src/router.ts#Nope"] }],
  ["fx-sequence", "a file as a step", { kind: "sequence", ids: [HANDLE_SYMBOL, ROUTER_FILE] }],
  ["fx-set", "one unknown member", { kind: "set", ids: [HANDLE_SYMBOL, "src/nope.ts"] }],
  ["fx-choice", "an option that isn't listed", { kind: "choice", option: "opt-z" }],
  ["fx-choice", "the option in the wrong case", { kind: "choice", option: "OPT-B" }],
];

const invalidBodies: [string, string][] = [
  ["not JSON", "{nope"],
  ["empty", ""],
  ["null", "null"],
  ["an array", "[]"],
  ["a missing kind", JSON.stringify({ id: HANDLE_SYMBOL })],
  ["an unknown kind", JSON.stringify({ kind: "fuzzy", id: HANDLE_SYMBOL })],
  ["a missing value", JSON.stringify({ kind: "symbol" })],
  ["a non-string value", JSON.stringify({ kind: "symbol", id: 5 })],
  ["an empty value", JSON.stringify({ kind: "symbol", id: "" })],
  ["a NUL byte", JSON.stringify({ kind: "symbol", id: "a\u0000b" })],
  ["an extra field", JSON.stringify({ kind: "symbol", id: HANDLE_SYMBOL, correct: true })],
  ["a long value", JSON.stringify({ kind: "symbol", id: "x".repeat(3000) })],
  ["a negative time", JSON.stringify({ kind: "symbol", id: HANDLE_SYMBOL, timeOnPuzzleMs: -1 })],
  ["a time too big for the column", JSON.stringify({ kind: "symbol", id: HANDLE_SYMBOL, timeOnPuzzleMs: 2 ** 31 })],
  ["a body over the size cap", JSON.stringify({ kind: "symbol", id: "x".repeat(300_000) })],
];

describe.skipIf(!hasDatabase)("POST /api/puzzles/:slug/submit", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  beforeEach(async () => {
    await resetRateLimits();
  });

  it("needs sign-in, and records nothing without it", async () => {
    const response = await submit("fx-symbol", undefined, { kind: "symbol", id: HANDLE_SYMBOL });
    expect(response.status).toBe(401);
    expectNoAnswerData(await response.text());
  });

  it.each(correctAnswers)("marks a correct %s answer correct", async (slug, body) => {
    const cookie = await signIn(`right-${slug}`);
    const response = await submit(slug, cookie, body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ correct: true, attempts: 1 });
    expect(await progressRow(`right-${slug}`, slug)).toMatchObject({ status: "solved", attempts: 1 });
  });

  it("accepts an ID listed in accept", async () => {
    const response = await submit("fx-symbol", await signIn("right-accept"), { kind: "symbol", id: ALIAS_SYMBOL });
    expect(await response.json()).toEqual({ correct: true, attempts: 1 });
  });

  it.each(wrongAnswers)("marks a wrong %s answer wrong: %s", async (slug, name, body) => {
    const login = `wrong-${slug}-${wrongAnswers.findIndex((row) => row[1] === name)}`;
    const cookie = await signIn(login);
    const response = await submit(slug, cookie, body);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ correct: false, attempts: 1 });
    expectNoAnswerData(text.replace('"correct"', ""));
    expect(await progressRow(login, slug)).toMatchObject({ status: "attempted", attempts: 1 });
  });

  describe("errors", () => {
    let cookie: string;

    beforeAll(async () => {
      cookie = await signIn("error-user");
    });

    it.each(unknownReferences)("400s on %s with %s, revealing nothing", async (slug, _name, body) => {
      const response = await submit(slug, cookie, body);
      expect(response.status).toBe(400);
      const text = await response.text();
      // The same fixed message whether or not the ID is close to the key.
      expect(JSON.parse(text)).toEqual({ error: "That answer refers to something not in this snapshot" });
      expectNoAnswerData(text);
    });

    it.each(invalidBodies)("400s on a body that's %s, revealing nothing", async (_name, rawBody) => {
      const response = await submitRoute(
        makeRequest("/api/puzzles/fx-symbol/submit", { cookie, rawBody, method: "POST" }),
        params({ slug: "fx-symbol" }),
      );
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Invalid submission" });
      expectNoAnswerData(text);
    });

    it("400s on the wrong answer kind, revealing nothing", async () => {
      const response = await submit("fx-symbol", cookie, { kind: "file", path: ROUTER_FILE });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "This puzzle takes a different kind of answer" });
      expectNoAnswerData(text);
    });

    it.each(["fx-hidden", "no-such-puzzle", "a b"])("404s on %s", async (slug) => {
      const response = await submit(slug, cookie, { kind: "symbol", id: HANDLE_SYMBOL });
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Puzzle not found" });
      expectNoAnswerData(text);
    });

    it("recorded none of those as attempts", async () => {
      expect(await submissionRows("error-user")).toEqual([]);
      for (const slug of ["fx-symbol", "fx-file", "fx-location", "fx-sequence", "fx-set", "fx-choice", "fx-hidden"]) {
        expect(await progressRow("error-user", slug)).toBeNull();
      }
    });

    it("returns a generic 500 for a malformed key, without logging or sending it", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      await getPool().query(
        `update puzzles set answer_json = '{"kind":"symbol","id":5,"secret":"KEYTOKEN_LEAK"}'
          where slug = 'fx-other'`,
      );
      try {
        const response = await submit("fx-other", cookie, { kind: "symbol", id: OTHER_SNAPSHOT_SYMBOL });
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ error: "Something went wrong" });
        expectNoAnswerData(text);
        expect(logged).toHaveBeenCalledOnce();
        const output = logged.mock.calls.flat().map(String).join(" ");
        expect(output).not.toContain("KEYTOKEN");
      } finally {
        await getPool().query(
          `update puzzles set answer_json = $1::jsonb where slug = 'fx-other'`,
          [JSON.stringify({ kind: "symbol", id: OTHER_SNAPSHOT_SYMBOL, accept: [], accept_reasons: [] })],
        );
        logged.mockRestore();
      }
    });
  });

  describe("recording", () => {
    it("stores what the user submitted and how long they took, not the key", async () => {
      const cookie = await signIn("rec-store");
      await submit("fx-file", cookie, { kind: "file", path: ROUTER_FILE, timeOnPuzzleMs: 1234 });
      expect(await submissionRows("rec-store")).toEqual([
        { answer_json: { kind: "file", path: ROUTER_FILE }, correct: false, time_on_puzzle_ms: 1234 },
      ]);
    });

    it("counts attempts across wrong and right answers, and shows them on the puzzle", async () => {
      const cookie = await signIn("rec-count");
      expect(await (await submit("fx-file", cookie, { kind: "file", path: ROUTER_FILE })).json()).toEqual({ correct: false, attempts: 1 });
      expect(await (await submit("fx-file", cookie, { kind: "file", path: "src/decoy.ts" })).json()).toEqual({ correct: false, attempts: 2 });
      expect(await (await submit("fx-file", cookie, { kind: "file", path: CONFIG_FILE })).json()).toEqual({ correct: true, attempts: 3 });
      expect(await detail("fx-file", cookie)).toMatchObject({ status: "solved", attempts: 3 });
      expect(await submissionRows("rec-count")).toHaveLength(3);
    });

    it("keeps attempts separate per user and per puzzle", async () => {
      const alice = await signIn("rec-alice");
      const bob = await signIn("rec-bob");
      await submit("fx-file", alice, { kind: "file", path: ROUTER_FILE });
      await submit("fx-file", alice, { kind: "file", path: ROUTER_FILE });
      expect(await (await submit("fx-file", bob, { kind: "file", path: ROUTER_FILE })).json()).toEqual({ correct: false, attempts: 1 });
      expect(await (await submit("fx-choice", alice, { kind: "choice", option: "opt-a" })).json()).toEqual({ correct: false, attempts: 1 });
    });

    it("stays solved after a later wrong answer, keeping the first solve time", async () => {
      const cookie = await signIn("rec-stay");
      await submit("fx-file", cookie, { kind: "file", path: CONFIG_FILE });
      const solved = await progressRow("rec-stay", "fx-file");
      expect(solved?.solved_at).toBeInstanceOf(Date);
      const later = await submit("fx-file", cookie, { kind: "file", path: ROUTER_FILE });
      expect(await later.json()).toEqual({ correct: false, attempts: 2 });
      const after = await progressRow("rec-stay", "fx-file");
      expect(after).toMatchObject({ status: "solved", attempts: 2 });
      expect(after?.solved_at).toEqual(solved?.solved_at);
    });

    it("loses no attempts to concurrent submissions", async () => {
      const cookie = await signIn("rec-race");
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => submit("fx-file", cookie, { kind: "file", path: ROUTER_FILE })),
      );
      const attempts = await Promise.all(
        responses.map(async (response) => ((await response.json()) as { attempts: number }).attempts),
      );
      expect(attempts.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(await submissionRows("rec-race")).toHaveLength(8);
    });

    it("records nothing if the progress update fails, and returns a generic 500", async () => {
      const cookie = await signIn("rec-atomic");
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const pool = getPool();
      await pool.query(`
        create function test_fail_progress() returns trigger language plpgsql as
          $$ begin raise exception 'select answer_json KEYTOKEN'; end $$;
        create trigger test_fail_progress before insert or update on progress
          for each row execute function test_fail_progress();
      `);
      try {
        const response = await submit("fx-file", cookie, { kind: "file", path: CONFIG_FILE });
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ error: "Something went wrong" });
        expectNoAnswerData(text);
      } finally {
        await pool.query(`
          drop trigger test_fail_progress on progress;
          drop function test_fail_progress();
        `);
        logged.mockRestore();
      }
      expect(await submissionRows("rec-atomic")).toEqual([]);
      expect(await progressRow("rec-atomic", "fx-file")).toBeNull();
    });
  });

  describe("giving up was removed", () => {
    it("has no route", () => {
      const route = path.resolve(import.meta.dirname, "../app/api/puzzles/[slug]/give-up");
      expect(existsSync(route)).toBe(false);
    });

    it("the database no longer accepts a given_up status", async () => {
      const cookie = await signIn("no-giveup-status");
      await submit("fx-file", cookie, { kind: "file", path: ROUTER_FILE });
      const user = await getPool().query<{ id: string }>(
        "select id from users where github_login = 'no-giveup-status'",
      );
      await expect(
        getPool().query(
          `update progress set status = 'given_up'
            where user_id = $1 and puzzle_id = (select id from puzzles where slug = 'fx-file')`,
          [user.rows[0]?.id],
        ),
      ).rejects.toThrow(/progress_status_check/);
    });
  });

  describe("rate limit", () => {
    it("returns 429 past the limit, per user", async () => {
      const cookie = await signIn("limited");
      // A rejected body still counts, and skips the database writes.
      for (let i = 0; i < SUBMIT_LIMIT.limit; i++) {
        expect((await submit("fx-file", cookie, {})).status).toBe(400);
      }
      const limited = await submit("fx-file", cookie, { kind: "file", path: CONFIG_FILE });
      expect(limited.status).toBe(429);
      expectNoAnswerData(await limited.text());
      expect(await submissionRows("limited")).toEqual([]);
      const other = await submit("fx-file", await signIn("not-limited"), { kind: "file", path: CONFIG_FILE });
      expect(other.status).toBe(200);
    });
  });
});
