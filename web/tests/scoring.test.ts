import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SCORING, scoreSolve } from "@/lib/scoring";
import { getPool } from "@/lib/server/db";
import { reconcileSolves } from "@/lib/server/scores";
import { seedFixtures } from "./fixtures";
import { hasDatabase, signIn } from "./helpers";
import { pastSubmission, puzzleId, reveal, submitOk, userIdFor, WRONG_FILE } from "./progress-helpers";

const MIGRATION = readFileSync(
  path.join(import.meta.dirname, "../../supabase/migrations/0009_hints_scores_challenges.sql"),
  "utf8",
);

describe("scoreSolve", () => {
  it("gives base points by difficulty, the first-try bonus and the hint deduction", () => {
    expect(scoreSolve("easy", false, 0).points).toBe(100);
    expect(scoreSolve("medium", false, 0).points).toBe(200);
    expect(scoreSolve("hard", false, 0).points).toBe(300);
    expect(scoreSolve("easy", true, 0)).toEqual({ basePoints: 100, firstTryBonus: 25, hintPenalty: 0, points: 125 });
    expect(scoreSolve("hard", true, 3)).toEqual({ basePoints: 300, firstTryBonus: 25, hintPenalty: 60, points: 265 });
    expect(scoreSolve("medium", false, 2).points).toBe(160);
  });

  it("never goes below the minimum, and counts at most three hints", () => {
    expect(scoreSolve("easy", false, 3).points).toBe(40);
    expect(scoreSolve("easy", false, 99).hintPenalty).toBe(60);
    expect(SCORING.minimum).toBeGreaterThan(0);
    expect(Math.min(...(["easy", "medium", "hard"] as const).map((d) => scoreSolve(d, false, 3).points))).toBeGreaterThanOrEqual(
      SCORING.minimum,
    );
  });

  it("matches the values migration 0009's backfill wrote in SQL", () => {
    expect(MIGRATION).toContain(
      `case p.difficulty when 'easy' then ${SCORING.base.easy} when 'medium' then ${SCORING.base.medium} when 'hard' then ${SCORING.base.hard} end`,
    );
    expect(MIGRATION).toContain(`case when first_sub.correct then ${SCORING.firstTryBonus} else 0 end`);
    expect(MIGRATION).toContain(`greatest(${SCORING.minimum}, base.points`);
  });
});

async function events(userId: string) {
  const { rows } = await getPool().query<{
    slug: string;
    kind: string;
    points: number;
    first_try: boolean;
    hints_used: number;
    backfilled: boolean;
  }>(
    `select p.slug, e.kind, e.points, e.first_try, e.hints_used, e.backfilled
       from score_events e join puzzles p on p.id = e.puzzle_id
      where e.user_id = $1 order by e.id`,
    [userId],
  );
  return rows;
}

describe.skipIf(!hasDatabase)("recording points", () => {
  beforeAll(async () => {
    await seedFixtures();
    // Keep challenge bonuses out of these totals: curate every open period onto fx-other.
    await getPool().query("delete from challenge_assignments");
    await getPool().query(
      `insert into challenge_assignments (period_kind, period_start, puzzle_id)
       select k, case k when 'daily' then (now() at time zone 'UTC')::date
                        when 'weekly' then date_trunc('week', now() at time zone 'UTC')::date
                        else date_trunc('month', now() at time zone 'UTC')::date end,
              (select id from puzzles where slug = 'fx-other')
         from unnest(array['daily', 'weekly', 'monthly']) as k`,
    );
  });

  it("awards a first-try solve with the bonus, once", async () => {
    const cookie = await signIn("score-first-try");
    const id = await userIdFor("score-first-try");
    const first = await submitOk("fx-file", cookie);
    expect(first).toMatchObject({ correct: true, attempts: 1, pointsAwarded: 125, challenges: [] });
    const again = await submitOk("fx-file", cookie);
    expect(again).toMatchObject({ correct: true, attempts: 2, pointsAwarded: 0 });
    expect(await events(id)).toEqual([
      { slug: "fx-file", kind: "solve", points: 125, first_try: true, hints_used: 0, backfilled: false },
    ]);
  });

  it("awards nothing for a wrong answer, and no bonus after one", async () => {
    const cookie = await signIn("score-second-try");
    const id = await userIdFor("score-second-try");
    expect(await submitOk("fx-file", cookie, WRONG_FILE)).toMatchObject({ correct: false, pointsAwarded: 0 });
    expect(await events(id)).toEqual([]);
    expect(await submitOk("fx-file", cookie)).toMatchObject({ correct: true, pointsAwarded: 100 });
  });

  it("takes off points for each hint revealed before the solve, and none after", async () => {
    const cookie = await signIn("score-hinted");
    const id = await userIdFor("score-hinted");
    await reveal("fx-symbol", cookie, 1);
    await reveal("fx-symbol", cookie, 2);
    expect(await submitOk("fx-symbol", cookie)).toMatchObject({ pointsAwarded: 125 - 40 });
    await reveal("fx-symbol", cookie, 3);
    expect((await events(id))[0]).toMatchObject({ points: 85, hints_used: 2 });
  });

  it("scores concurrent correct submissions once", async () => {
    const cookie = await signIn("score-racer");
    const id = await userIdFor("score-racer");
    const results = await Promise.all(Array.from({ length: 5 }, () => submitOk("fx-location", cookie)));
    expect(results.filter((r) => r.pointsAwarded > 0)).toHaveLength(1);
    expect(results.map((r) => r.attempts).sort()).toEqual([1, 2, 3, 4, 5]);
    // Exactly one submission was first, and only it can have earned the bonus.
    expect(await events(id)).toEqual([
      { slug: "fx-location", kind: "solve", points: 225, first_try: true, hints_used: 0, backfilled: false },
    ]);
  });

  it("backfills solves made before scoring, by the migration's rule", async () => {
    await signIn("score-historian");
    const id = await userIdFor("score-historian");
    await pastSubmission(id, "fx-set", false, "2026-01-02T10:00:00Z");
    await pastSubmission(id, "fx-set", true, "2026-01-03T10:00:00Z");
    await pastSubmission(id, "fx-choice", true, "2026-01-04T10:00:00Z");
    // Run the migration's own backfill statement against this history.
    const start = MIGRATION.indexOf("insert into score_events (\n  user_id, puzzle_id, kind,");
    const end = MIGRATION.indexOf("on conflict do nothing;", start) + "on conflict do nothing".length;
    await getPool().query(MIGRATION.slice(start, end));
    const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);
    expect((await events(id)).sort(bySlug)).toEqual([
      { slug: "fx-choice", kind: "solve", points: 125, first_try: true, hints_used: 0, backfilled: true },
      { slug: "fx-set", kind: "solve", points: 300, first_try: false, hints_used: 0, backfilled: true },
    ]);
    const { rows } = await getPool().query<{ earned_at: Date }>(
      "select earned_at from score_events where user_id = $1 and puzzle_id = $2",
      [id, await puzzleId("fx-set")],
    );
    expect(rows[0]?.earned_at.toISOString()).toBe("2026-01-03T10:00:00.000Z");
  });

  it("reconciles a solve with no points row the same way, without doubling one that has it", async () => {
    await signIn("score-reconciled");
    const id = await userIdFor("score-reconciled");
    await pastSubmission(id, "fx-sequence", true, "2026-02-01T09:00:00Z");
    await reconcileSolves(id);
    await reconcileSolves(id);
    expect(await events(id)).toEqual([
      { slug: "fx-sequence", kind: "solve", points: 225, first_try: true, hints_used: 0, backfilled: true },
    ]);
  });
});
