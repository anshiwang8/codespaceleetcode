import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as achievementsRoute } from "@/app/api/me/achievements/route";
import type { AchievementsResponse } from "@/lib/api-types";
import { ACHIEVEMENTS, achievementById } from "@/lib/achievements";
import { evaluateAchievements, getAchievements } from "@/lib/server/achievements";
import { getPool } from "@/lib/server/db";
import { seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, signIn } from "./helpers";
import { pastSubmission, reveal, submitOk, userIdFor } from "./progress-helpers";

describe("the achievement registry", () => {
  it("has unique, stable ids and positive thresholds", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9-]{1,60}$/);
      expect(a.threshold === "all" || a.threshold > 0).toBe(true);
    }
  });

  it("includes every badge the product asked for", () => {
    for (const id of [
      "first-steps",
      "getting-comfortable",
      "code-explorer",
      "easy-explorer",
      "medium-challenger",
      "hard-mode",
      "three-day-streak",
      "seven-day-streak",
      "thirty-day-streak",
      "first-try-success",
      "independent-thinker",
      "repository-explorer",
      "all-rounder",
    ]) {
      expect(achievementById(id), id).toBeDefined();
    }
  });
});

async function stored(userId: string) {
  const { rows } = await getPool().query<{ achievement_id: string; unlocked_at: Date }>(
    "select achievement_id, unlocked_at from user_achievements where user_id = $1 order by achievement_id",
    [userId],
  );
  return rows;
}

describe.skipIf(!hasDatabase)("achievements", () => {
  beforeAll(async () => {
    await seedFixtures();
  });
  beforeEach(async () => {
    // No open challenge features the fixtures, so challenge badges stay out of these.
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

  it("unlocks on the submission that earns it, exactly once", async () => {
    const cookie = await signIn("ach-first");
    const id = await userIdFor("ach-first");
    const first = await submitOk("fx-file", cookie);
    expect(first.achievements.map((a) => a.id).sort()).toEqual(["first-steps", "first-try-success", "independent-thinker"]);
    const again = await submitOk("fx-file", cookie);
    expect(again.achievements).toEqual([]);
    const second = await submitOk("fx-choice", cookie);
    expect(second.achievements).toEqual([]);
    expect((await stored(id)).map((r) => r.achievement_id)).toEqual(["first-steps", "first-try-success", "independent-thinker"]);
    // Evaluating again, or concurrently, adds nothing.
    await Promise.all([evaluateAchievements(id), evaluateAchievements(id), getAchievements(id)]);
    expect(await stored(id)).toHaveLength(3);
  });

  it("doesn't count a solve after a hint as independent, or a second try as first-try", async () => {
    const cookie = await signIn("ach-hinted");
    const id = await userIdFor("ach-hinted");
    await reveal("fx-symbol", cookie, 1);
    await reveal("fx-file", cookie, 1);
    await submitOk("fx-file", cookie, { kind: "file", path: "src/router.ts" });
    await submitOk("fx-file", cookie);
    const hinted = await submitOk("fx-symbol", cookie);
    expect(hinted.achievements.map((a) => a.id)).not.toContain("independent-thinker");
    const ids = (await stored(id)).map((r) => r.achievement_id);
    expect(ids).toContain("first-try-success");
    expect(ids).not.toContain("independent-thinker");
    // Both solves came after a hint, so neither counts; fx-symbol was still a first try.
    const progress = (await getAchievements(id)).achievements.find((a) => a.id === "independent-thinker");
    expect(progress).toMatchObject({ progress: 0, unlockedAt: null });
  });

  it("awards older accounts retroactively, dated by when they earned it", async () => {
    await signIn("ach-veteran");
    const id = await userIdFor("ach-veteran");
    // Three consecutive UTC days, the third a correct solve.
    await pastSubmission(id, "fx-file", false, "2026-03-01T23:00:00Z");
    await pastSubmission(id, "fx-file", true, "2026-03-02T01:00:00Z");
    await pastSubmission(id, "fx-choice", true, "2026-03-03T15:30:00Z");
    await pastSubmission(id, "fx-sequence", true, "2026-03-03T16:00:00Z");
    await pastSubmission(id, "fx-set", true, "2026-03-03T17:00:00Z");

    const { achievements } = await getAchievements(id);
    const byId = new Map(achievements.map((a) => [a.id, a]));
    expect(byId.get("first-steps")?.unlockedAt).toBe("2026-03-02T01:00:00.000Z");
    expect(byId.get("three-day-streak")?.unlockedAt).toBe("2026-03-03T15:30:00.000Z");
    // find, architecture and trace are every published type in the fixtures.
    expect(byId.get("all-rounder")).toMatchObject({ threshold: 3, progress: 3, unlockedAt: "2026-03-03T16:00:00.000Z" });
    // History from before hints were tracked can't prove no hint was used.
    expect(byId.get("independent-thinker")?.unlockedAt).toBeNull();
    expect(byId.get("first-try-success")?.unlockedAt).toBe("2026-03-03T15:30:00.000Z");
    expect(byId.get("seven-day-streak")).toMatchObject({ threshold: 7, progress: 3, unlockedAt: null });
    expect(byId.get("getting-comfortable")).toMatchObject({ threshold: 5, progress: 4, unlockedAt: null });
  });

  it("serves the list only to the signed-in user", async () => {
    expect((await achievementsRoute(makeRequest("/api/me/achievements"), undefined)).status).toBe(401);
    const cookie = await signIn("ach-reader");
    const response = await achievementsRoute(makeRequest("/api/me/achievements", { cookie }), undefined);
    expect(response.status).toBe(200);
    const body = (await response.json()) as AchievementsResponse;
    expect(body.achievements.map((a) => a.id)).toEqual(ACHIEVEMENTS.filter((a) => !a.retired).map((a) => a.id));
    expect(body.achievements.every((a) => a.unlockedAt === null && a.progress === 0)).toBe(true);
  });
});
