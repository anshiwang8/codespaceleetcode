import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as detailRoute } from "@/app/api/puzzles/[slug]/route";
import { GET as solutionRoute } from "@/app/api/puzzles/[slug]/solution/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import { GET as listRoute } from "@/app/api/puzzles/route";
import type { PuzzleDetail, PuzzleListResponse, StatsResponse } from "@/lib/api-types";
import { GET as statsRoute } from "@/app/api/me/stats/route";
import { getPool } from "@/lib/server/db";
import { HANDLE_SYMBOL, PUBLISHED_PUZZLE_COUNT, ROUTER_FILE, seedFixtures, type Fixtures } from "./fixtures";
import { expectNoAnswerData, hasDatabase, makeRequest, params, signIn } from "./helpers";

async function getList(query = "", cookie?: string): Promise<PuzzleListResponse> {
  const response = await listRoute(makeRequest(`/api/puzzles${query}`, { cookie }), undefined);
  expect(response.status).toBe(200);
  return (await response.json()) as PuzzleListResponse;
}

async function getDetail(slug: string, cookie?: string): Promise<Response> {
  return detailRoute(makeRequest(`/api/puzzles/${slug}`, { cookie }), params({ slug }));
}

/** A graded wrong answer to `fx-file`, which leaves it `attempted`. */
async function missFile(cookie: string): Promise<void> {
  const response = await submitRoute(
    makeRequest("/api/puzzles/fx-file/submit", { cookie, body: { kind: "file", path: ROUTER_FILE } }),
    params({ slug: "fx-file" }),
  );
  expect(await response.json()).toMatchObject({ correct: false });
}

async function solve(slug: string, cookie: string): Promise<void> {
  const response = await submitRoute(
    makeRequest(`/api/puzzles/${slug}/submit`, { cookie, body: { kind: "symbol", id: HANDLE_SYMBOL } }),
    params({ slug }),
  );
  expect(await response.json()).toMatchObject({ correct: true });
}

describe.skipIf(!hasDatabase)("puzzle reads", () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await seedFixtures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/puzzles", () => {
    it("lists published puzzles only", async () => {
      const { puzzles } = await getList();
      expect(puzzles).toHaveLength(PUBLISHED_PUZZLE_COUNT);
      expect(puzzles.map((puzzle) => puzzle.slug)).not.toContain("fx-hidden");
      expect(puzzles.map((puzzle) => puzzle.slug)).not.toContain("fx-hidden-repo");
    });

    it("offers filter values only from published puzzles", async () => {
      const { repos, tags } = await getList();
      expect(repos).toEqual(["acme-router", "other-lib"]);
      expect(tags).toEqual(["config", "http", "other", "routing"]);
    });

    it("keeps the full filter values when a filter narrows the list", async () => {
      const { puzzles, repos } = await getList("?repo=other-lib");
      expect(puzzles).toHaveLength(1);
      expect(repos).toEqual(["acme-router", "other-lib"]);
    });

    it.each([
      ["?type=trace", ["fx-sequence"]],
      ["?difficulty=hard", ["fx-set", "fx-other"]],
      ["?repo=other-lib", ["fx-other"]],
      ["?tag=routing", ["fx-symbol"]],
      ["?type=find&difficulty=easy", ["fx-symbol", "fx-file"]],
      ["?tag=hidden-tag", []],
      ["?repo=hidden-repo", []],
      ["?repo=nope", []],
    ])("filters with %s", async (query, slugs) => {
      const { puzzles } = await getList(query);
      expect(puzzles.map((puzzle) => puzzle.slug)).toEqual(slugs);
    });

    it.each(["?type=nope", "?difficulty=impossible", "?tag=a%00b"])("refuses %s", async (query) => {
      const response = await listRoute(makeRequest(`/api/puzzles${query}`), undefined);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid filter" });
    });

    it("shows unsolved to anyone signed out, and each user's own status", async () => {
      const alice = await signIn("list-alice");
      const bob = await signIn("list-bob");
      await solve("fx-symbol", alice);
      const statusFor = async (cookie?: string) =>
        (await getList("", cookie)).puzzles.find((puzzle) => puzzle.slug === "fx-symbol")?.status;
      expect(await statusFor(alice)).toBe("solved");
      expect(await statusFor(bob)).toBe("unsolved");
      expect(await statusFor()).toBe("unsolved");
    });

    it("never contains answer data", async () => {
      const cookie = await signIn("list-scan");
      expectNoAnswerData(JSON.stringify(await getList()));
      expectNoAnswerData(JSON.stringify(await getList("", cookie)));
    });
  });

  describe("GET /api/puzzles/:slug", () => {
    it("returns exactly the fields of PuzzleDetail", async () => {
      const response = await getDetail("fx-set");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        slug: "fx-set",
        type: "architecture",
        difficulty: "hard",
        title: "Title of fx-set",
        repoSlug: "acme-router",
        language: "typescript",
        tags: [],
        status: "unsolved",
        prompt: "Prompt for fx-set. Select an answer.",
        answerKind: "set",
        setCount: 2,
        choices: null,
        hints: ["A hint."],
        verifiedBy: ["agent:tester"],
        attempts: 0,
        snapshot: {
          id: fixtures.snapshotId,
          name: `acme-router@${"a".repeat(40)}`,
          sha: "a".repeat(40),
          repoSlug: "acme-router",
          repoUrl: "https://github.com/example/acme-router",
          license: "MIT",
          language: "typescript",
          manifestUrl: `/snapshots/acme-router@${"a".repeat(40)}/manifest.json`,
        },
      } satisfies PuzzleDetail);
    });

    it.each([
      "fx-symbol",
      "fx-file",
      "fx-location",
      "fx-sequence",
      "fx-set",
      "fx-choice",
      "fx-other",
    ])("never contains answer data for %s, signed out or in", async (slug) => {
      const cookie = await signIn("detail-scan");
      expectNoAnswerData(await (await getDetail(slug)).text());
      expectNoAnswerData(await (await getDetail(slug, cookie)).text());
    });

    it("still doesn't contain the key once the user has solved it", async () => {
      const cookie = await signIn("detail-solved");
      await solve("fx-symbol", cookie);
      const response = await getDetail("fx-symbol", cookie);
      const text = await response.text();
      expectNoAnswerData(text);
      expect(JSON.parse(text)).toMatchObject({ status: "solved", attempts: 1 });
    });

    it("sends only id and label for each choice", async () => {
      const detail = (await (await getDetail("fx-choice")).json()) as PuzzleDetail;
      expect(detail.choices).toEqual([
        { id: "opt-a", label: "Option A" },
        { id: "opt-b", label: "Option B" },
        { id: "opt-c", label: "Option C" },
      ]);
    });

    it.each(["fx-hidden", "fx-hidden-repo", "no-such-puzzle", "../etc", "a%00b", "a b"])(
      "returns the same 404 for %s",
      async (slug) => {
        const response = await getDetail(slug);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Puzzle not found" });
      },
    );

    it("returns a generic 500 when the database fails, without the query", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(getPool(), "query").mockImplementation(() => {
        throw new Error("select answer_json from puzzles where id = 'KEYTOKEN'");
      });
      const response = await getDetail("fx-symbol");
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Something went wrong" });
      expectNoAnswerData(text);
      expect(logged).toHaveBeenCalledOnce();
    });
  });

  describe("GET /api/puzzles/:slug/solution", () => {
    const getSolution = (slug: string, cookie?: string) =>
      solutionRoute(makeRequest(`/api/puzzles/${slug}/solution`, { cookie }), params({ slug }));

    it("needs sign-in", async () => {
      const response = await getSolution("fx-symbol");
      expect(response.status).toBe(401);
      expectNoAnswerData(await response.text());
    });

    it("is 403 with no solution data before any attempt", async () => {
      const response = await getSolution("fx-symbol", await signIn("sol-new"));
      expect(response.status).toBe(403);
      expectNoAnswerData(await response.text());
    });

    it("is 403 after only wrong answers", async () => {
      const cookie = await signIn("sol-wrong");
      const wrong = await submitRoute(
        makeRequest("/api/puzzles/fx-file/submit", { cookie, body: { kind: "file", path: "src/decoy.ts" } }),
        params({ slug: "fx-file" }),
      );
      expect(await wrong.json()).toEqual({ correct: false, attempts: 1 });
      const response = await getSolution("fx-file", cookie);
      expect(response.status).toBe(403);
      expectNoAnswerData(await response.text());
    });

    it("unlocks on a correct answer", async () => {
      const cookie = await signIn("sol-solved");
      await solve("fx-symbol", cookie);
      const response = await getSolution("fx-symbol", cookie);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ bodyMd: "SOLUTIONTOKEN for fx-symbol" });
    });

    it("stays locked after only wrong answers", async () => {
      const cookie = await signIn("sol-attempted");
      await missFile(cookie);
      const response = await getSolution("fx-file", cookie);
      expect(response.status).toBe(403);
      expectNoAnswerData(await response.text());
    });

    it("isn't unlocked by someone else's solve, or by solving a different puzzle", async () => {
      const solver = await signIn("sol-other-solver");
      await solve("fx-symbol", solver);
      expect((await getSolution("fx-symbol", await signIn("sol-other-viewer"))).status).toBe(403);
      expect((await getSolution("fx-file", solver)).status).toBe(403);
    });

    it("is 404 for an unpublished puzzle, even with progress on it", async () => {
      const cookie = await signIn("sol-hidden");
      const puzzle = await getPool().query<{ id: string }>(
        "select id from puzzles where slug = 'fx-hidden'",
      );
      const user = await getPool().query<{ id: string }>(
        "select id from users where github_login = 'sol-hidden'",
      );
      await getPool().query(
        "insert into progress (user_id, puzzle_id, status) values ($1, $2, 'solved')",
        [user.rows[0]?.id, puzzle.rows[0]?.id],
      );
      const response = await getSolution("fx-hidden", cookie);
      expect(response.status).toBe(404);
      expectNoAnswerData(await response.text());
    });
  });

  describe("GET /api/me/stats", () => {
    it("needs sign-in", async () => {
      expect((await statsRoute(makeRequest("/api/me/stats"), undefined)).status).toBe(401);
    });

    it("counts published puzzles, and only `solved` as solved", async () => {
      const cookie = await signIn("stats-user");
      await solve("fx-symbol", cookie);
      await missFile(cookie);
      const response = await statsRoute(makeRequest("/api/me/stats", { cookie }), undefined);
      expect(await response.json()).toEqual({
        solved: 1,
        total: PUBLISHED_PUZZLE_COUNT,
        byType: {
          find: { solved: 1, total: 4 },
          trace: { solved: 0, total: 1 },
          architecture: { solved: 0, total: 2 },
          design: { solved: 0, total: 0 },
        },
        byDifficulty: {
          easy: { solved: 1, total: 3 },
          medium: { solved: 0, total: 2 },
          hard: { solved: 0, total: 2 },
        },
      } satisfies StatsResponse);
    });
  });
});

describe("source guards", () => {
  const webRoot = path.resolve(import.meta.dirname, "..");
  const sources = ["app", "lib"]
    .flatMap((directory) =>
      readdirSync(path.join(webRoot, directory), { recursive: true, encoding: "utf8" })
        .filter((file) => /\.tsx?$/.test(file))
        .map((file) => path.join(directory, file)),
    )
    .map((file) => ({
      file: file.replaceAll("\\", "/"),
      text: readFileSync(path.join(webRoot, file), "utf8"),
    }));

  it("reads the answer key column only in submit.ts", () => {
    const readers = sources.filter(({ text }) => text.includes("answer_json")).map(({ file }) => file);
    expect(readers).toEqual(["lib/server/submit.ts"]);
  });

  it("never uses select *", () => {
    const offenders = sources.filter(({ text }) => /select\s+(\w+\.)?\*/i.test(text));
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it("reads the solutions table only in puzzles.ts", () => {
    const readers = sources
      .filter(({ text }) => /from\s+solutions/i.test(text))
      .map(({ file }) => file);
    expect(readers).toEqual(["lib/server/puzzles.ts"]);
  });
});
