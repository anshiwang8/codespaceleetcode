import { beforeAll, describe, expect, it } from "vitest";
import { GET as getPuzzle } from "@/app/api/puzzles/[slug]/route";
import type { HintRevealResponse, PuzzleDetail } from "@/lib/api-types";
import { getPool } from "@/lib/server/db";
import { seedFixtures, THREE_HINTS } from "./fixtures";
import { expectNoAnswerData, hasDatabase, makeRequest, params, signIn } from "./helpers";
import { reveal, userIdFor } from "./progress-helpers";

async function detail(slug: string, cookie?: string): Promise<{ text: string; body: PuzzleDetail }> {
  const response = await getPuzzle(makeRequest(`/api/puzzles/${slug}`, { cookie }), params({ slug }));
  expect(response.status).toBe(200);
  const text = await response.text();
  return { text, body: JSON.parse(text) as PuzzleDetail };
}

describe.skipIf(!hasDatabase)("progressive hints", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  it("sends only the count, never unrevealed hint text", async () => {
    const signedOut = await detail("fx-symbol");
    expect(signedOut.body.hintCount).toBe(3);
    expect(signedOut.body.revealedHints).toEqual([]);
    for (const hint of THREE_HINTS) expect(signedOut.text).not.toContain(hint.split(" ")[0]);

    const cookie = await signIn("hint-reader");
    const signedIn = await detail("fx-symbol", cookie);
    expect(signedIn.body.revealedHints).toEqual([]);
    expect(signedIn.text).not.toContain("HINTLEVEL");
  });

  it("reveals levels in order, and remembers them on the next visit", async () => {
    const cookie = await signIn("hint-climber");
    expect((await reveal("fx-symbol", cookie, 2)).status).toBe(409);
    expect((await reveal("fx-symbol", cookie, 3)).status).toBe(409);

    const first = await reveal("fx-symbol", cookie, 1);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ hintCount: 3, revealedHints: THREE_HINTS.slice(0, 1) } satisfies HintRevealResponse);
    // The page now shows the first level only.
    const after = await detail("fx-symbol", cookie);
    expect(after.body.revealedHints).toEqual([THREE_HINTS[0]]);
    expect(after.text).not.toContain("HINTLEVEL2");

    expect((await reveal("fx-symbol", cookie, 3)).status).toBe(409);
    const second = (await (await reveal("fx-symbol", cookie, 2)).json()) as HintRevealResponse;
    expect(second.revealedHints).toEqual(THREE_HINTS.slice(0, 2));
    const third = (await (await reveal("fx-symbol", cookie, 3)).json()) as HintRevealResponse;
    expect(third.revealedHints).toEqual(THREE_HINTS);
    expect((await detail("fx-symbol", cookie)).body.revealedHints).toEqual(THREE_HINTS);
  });

  it("asking for a revealed level again records nothing new", async () => {
    const cookie = await signIn("hint-repeater");
    const id = await userIdFor("hint-repeater");
    for (let i = 0; i < 3; i++) expect((await reveal("fx-symbol", cookie, 1)).status).toBe(200);
    const { rows } = await getPool().query("select level from hint_reveals where user_id = $1", [id]);
    expect(rows).toEqual([{ level: 1 }]);
  });

  it("keeps a one-hint puzzle working, with no level past its hints", async () => {
    const cookie = await signIn("hint-single");
    const page = await detail("fx-file", cookie);
    expect(page.body.hintCount).toBe(1);
    const first = (await (await reveal("fx-file", cookie, 1)).json()) as HintRevealResponse;
    expect(first).toEqual({ hintCount: 1, revealedHints: ["A hint."] });
    expect((await reveal("fx-file", cookie, 2)).status).toBe(400);
  });

  it("never records levels out of order, even when requests race", async () => {
    const cookie = await signIn("hint-racer");
    const id = await userIdFor("hint-racer");
    await Promise.all([3, 2, 1, 2, 3, 1].map((level) => reveal("fx-symbol", cookie, level)));
    const { rows } = await getPool().query<{ level: number }>(
      "select level from hint_reveals where user_id = $1 order by level",
      [id],
    );
    const levels = rows.map((row) => row.level);
    // Whatever got through, it's a prefix of 1, 2, 3 with no gap.
    expect(levels).toEqual([1, 2, 3].slice(0, levels.length));
    expect(levels.length).toBeGreaterThanOrEqual(1);
  });

  it("refuses signed-out, cross-site, malformed and unknown requests", async () => {
    expect((await reveal("fx-symbol", undefined, 1)).status).toBe(401);
    const cookie = await signIn("hint-refused");
    expect((await reveal("fx-symbol", cookie, 1, "https://evil.example")).status).toBe(403);
    expect((await reveal("fx-symbol", cookie, 1, null)).status).toBe(403);
    for (const level of [0, 4, 1.5, "1", null]) expect((await reveal("fx-symbol", cookie, level)).status).toBe(400);
    expect((await reveal("fx-hidden", cookie, 1)).status).toBe(404);
    expect((await reveal("no-such-puzzle", cookie, 1)).status).toBe(404);
    const id = await userIdFor("hint-refused");
    const { rows } = await getPool().query("select 1 from hint_reveals where user_id = $1", [id]);
    expect(rows).toEqual([]);
  });

  it("puts no answer data in hint responses or errors", async () => {
    const cookie = await signIn("hint-scanner");
    for (const level of [1, 2, 3, 4]) expectNoAnswerData(await (await reveal("fx-symbol", cookie, level)).text());
    expectNoAnswerData(await (await reveal("fx-symbol", cookie, 9)).text());
  });
});
