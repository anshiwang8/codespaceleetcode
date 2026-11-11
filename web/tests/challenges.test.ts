import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  currentPeriod,
  describePeriod,
  formatTimeLeft,
  isPeriodStart,
  nextPeriodStart,
  periodStart,
  previousPeriodStart,
} from "@/lib/periods";
import { challengeStreakFrom, ensureAssignments, getChallengeArchive, getChallenges } from "@/lib/server/challenges";
import { getPool } from "@/lib/server/db";
import { seedFixtures } from "./fixtures";
import { hasDatabase, signIn } from "./helpers";
import { CORRECT, pastSubmission, submitOk, userIdFor } from "./progress-helpers";

const at = (iso: string) => new Date(iso);

describe("UTC periods", () => {
  const zone = process.env.TZ;
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it("starts days at 00:00 UTC, weeks on Monday and months on the 1st", () => {
    expect(periodStart("daily", at("2026-11-11T23:59:59.999Z"))).toBe("2026-11-11");
    expect(periodStart("daily", at("2026-11-12T00:00:00.000Z"))).toBe("2026-11-12");
    // 2026-11-15 is a Sunday: still the week that began Monday the 9th.
    expect(periodStart("weekly", at("2026-11-15T23:59:59Z"))).toBe("2026-11-09");
    expect(periodStart("weekly", at("2026-11-16T00:00:00Z"))).toBe("2026-11-16");
    expect(periodStart("monthly", at("2026-11-30T23:59:59Z"))).toBe("2026-11-01");
    expect(periodStart("monthly", at("2026-12-01T00:00:00Z"))).toBe("2026-12-01");
  });

  it("crosses year, month and leap-day boundaries", () => {
    // 2027-01-01 is a Friday: its week began Monday 2026-12-28.
    expect(periodStart("weekly", at("2027-01-01T12:00:00Z"))).toBe("2026-12-28");
    expect(nextPeriodStart("weekly", "2026-12-28")).toBe("2027-01-04");
    expect(nextPeriodStart("daily", "2028-02-28")).toBe("2028-02-29");
    expect(nextPeriodStart("monthly", "2026-12-01")).toBe("2027-01-01");
    expect(previousPeriodStart("monthly", "2027-01-01")).toBe("2026-12-01");
    expect(previousPeriodStart("weekly", "2027-01-04")).toBe("2026-12-28");
    expect(currentPeriod("monthly", at("2028-02-10T00:00:00Z"))).toMatchObject({
      startsAt: "2028-02-01T00:00:00.000Z",
      endsAt: "2028-03-01T00:00:00.000Z",
    });
  });

  it("gives the same answer whatever the server's time zone is", () => {
    const moments = ["2026-11-15T23:30:00Z", "2026-11-16T00:30:00Z", "2026-12-31T23:59:59Z", "2027-01-01T00:00:01Z"];
    const results = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"].map((tz) => {
      process.env.TZ = tz;
      return moments.flatMap((m) => [
        periodStart("daily", at(m)),
        periodStart("weekly", at(m)),
        periodStart("monthly", at(m)),
        describePeriod("daily", periodStart("daily", at(m))),
      ]);
    });
    for (const result of results) expect(result).toEqual(results[0]);
  });

  it("knows which dates can start a period", () => {
    expect(isPeriodStart("weekly", "2026-11-09")).toBe(true);
    expect(isPeriodStart("weekly", "2026-11-10")).toBe(false);
    expect(isPeriodStart("monthly", "2026-11-01")).toBe(true);
    expect(isPeriodStart("daily", "2026-02-30")).toBe(false);
    expect(isPeriodStart("daily", "nonsense")).toBe(false);
  });

  it("words periods and time left", () => {
    expect(describePeriod("daily", "2026-11-11")).toBe("Wednesday, November 11, 2026");
    expect(describePeriod("weekly", "2026-11-09")).toBe("Week of November 9, 2026");
    expect(describePeriod("monthly", "2026-11-01")).toBe("November 2026");
    const now = at("2026-11-11T18:48:00Z");
    expect(formatTimeLeft("2026-11-12T00:00:00.000Z", now)).toBe("5h 12m");
    expect(formatTimeLeft("2026-11-16T00:00:00.000Z", now)).toBe("4d 5h");
    expect(formatTimeLeft("2026-11-11T18:48:30.000Z", now)).toBe("under a minute");
    expect(formatTimeLeft("2026-11-11T00:00:00.000Z", now)).toBe("ended");
  });
});

describe("challengeStreakFrom", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(challengeStreakFrom(["2026-11-09", "2026-11-10", "2026-11-11"], "2026-11-11")).toEqual({
      current: 3,
      longest: 3,
      completedToday: true,
    });
    expect(challengeStreakFrom(["2026-11-09", "2026-11-10"], "2026-11-11")).toEqual({
      current: 2,
      longest: 2,
      completedToday: false,
    });
    expect(challengeStreakFrom(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-09"], "2026-11-11")).toEqual({
      current: 0,
      longest: 3,
      completedToday: false,
    });
    expect(challengeStreakFrom([], "2026-11-11")).toEqual({ current: 0, longest: 0, completedToday: false });
  });

  it("ignores duplicate completions of a day", () => {
    expect(challengeStreakFrom(["2026-11-11", "2026-11-11", "2026-11-10"], "2026-11-11").current).toBe(2);
  });

  it("crosses month and year boundaries", () => {
    expect(challengeStreakFrom(["2026-12-30", "2026-12-31", "2027-01-01"], "2027-01-01").current).toBe(3);
  });
});

async function assignments() {
  const { rows } = await getPool().query<{ period_kind: string; period_start: string; slug: string }>(
    `select a.period_kind, to_char(a.period_start, 'YYYY-MM-DD') as period_start, p.slug
       from challenge_assignments a join puzzles p on p.id = a.puzzle_id
      order by a.period_kind, a.period_start`,
  );
  return rows;
}

/** Puts a specific puzzle on the current period of a kind, as a curator would. */
async function curate(kind: string, start: string, slug: string): Promise<void> {
  await getPool().query(
    `insert into challenge_assignments (period_kind, period_start, puzzle_id)
     values ($1, $2::date, (select id from puzzles where slug = $3))
     on conflict (period_kind, period_start) do update set puzzle_id = excluded.puzzle_id`,
    [kind, start, slug],
  );
}

describe.skipIf(!hasDatabase)("challenge scheduling", () => {
  beforeAll(async () => {
    await seedFixtures();
  });
  beforeEach(async () => {
    await getPool().query("delete from challenge_assignments");
  });

  it("gives every kind one stable puzzle for its whole period", async () => {
    const morning = at("2026-11-11T00:00:00Z");
    await ensureAssignments(morning);
    const first = await assignments();
    expect(first.map((a) => [a.period_kind, a.period_start])).toEqual([
      ["daily", "2026-11-11"],
      ["monthly", "2026-11-01"],
      ["weekly", "2026-11-09"],
    ]);
    // Later the same day, and after puzzles change, the choice stays.
    await ensureAssignments(at("2026-11-11T23:59:59Z"));
    await getPool().query("update puzzles set title = title || '!'");
    await ensureAssignments(at("2026-11-11T12:00:00Z"));
    expect(await assignments()).toEqual(first);
  });

  it("draws from each kind's difficulty pool, and rotates at midnight UTC", async () => {
    await ensureAssignments(at("2026-11-11T08:00:00Z"));
    await ensureAssignments(at("2026-11-12T00:00:00Z"));
    const rows = await assignments();
    const difficulty = async (slug: string) =>
      (await getPool().query<{ difficulty: string }>("select difficulty from puzzles where slug = $1", [slug])).rows[0]
        ?.difficulty;
    const daily = rows.filter((r) => r.period_kind === "daily");
    expect(daily.map((r) => r.period_start)).toEqual(["2026-11-11", "2026-11-12"]);
    expect(daily[0]?.slug).not.toBe(daily[1]?.slug);
    for (const row of daily) expect(["easy", "medium"]).toContain(await difficulty(row.slug));
    expect(await difficulty(rows.find((r) => r.period_kind === "weekly")!.slug)).toBe("medium");
    expect(await difficulty(rows.find((r) => r.period_kind === "monthly")!.slug)).toBe("hard");
  });

  it("fills skipped periods so the archive has no gaps, and avoids repeats", async () => {
    await ensureAssignments(at("2026-11-01T10:00:00Z"));
    await ensureAssignments(at("2026-11-05T10:00:00Z"));
    const daily = (await assignments()).filter((r) => r.period_kind === "daily");
    expect(daily.map((r) => r.period_start)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    // The daily pool has 5 easy or medium puzzles, so 5 days use 5 different ones.
    expect(new Set(daily.map((r) => r.slug)).size).toBe(5);
  });

  it("picks the same puzzles when two requests race", async () => {
    await Promise.all(Array.from({ length: 6 }, () => ensureAssignments(at("2026-11-11T10:00:00Z"))));
    expect(await assignments()).toHaveLength(3);
  });

  it("keeps a curated row instead of choosing", async () => {
    await curate("daily", "2026-11-11", "fx-choice");
    await ensureAssignments(at("2026-11-11T10:00:00Z"));
    expect((await assignments()).find((r) => r.period_kind === "daily")?.slug).toBe("fx-choice");
  });

  it("shows signed-out visitors the same challenges, without progress", async () => {
    const now = at("2026-11-11T10:00:00Z");
    const response = await getChallenges(null, now);
    expect(response.current.map((c) => c.kind)).toEqual(["daily", "weekly", "monthly"]);
    expect(response.streak).toBeNull();
    expect(response.current[0]).toMatchObject({
      periodStart: "2026-11-11",
      label: "Wednesday, November 11, 2026",
      startsAt: "2026-11-11T00:00:00.000Z",
      endsAt: "2026-11-12T00:00:00.000Z",
      bonus: 50,
      completed: false,
    });
  });
});

describe.skipIf(!hasDatabase)("challenge completion", () => {
  let today: { daily: string; weekly: string; monthly: string };

  beforeAll(async () => {
    await seedFixtures();
  });
  beforeEach(async () => {
    await getPool().query("delete from challenge_assignments");
    const { rows } = await getPool().query<{ now: Date }>("select now() as now");
    const now = rows[0]!.now;
    today = { daily: periodStart("daily", now), weekly: periodStart("weekly", now), monthly: periodStart("monthly", now) };
    await curate("daily", today.daily, "fx-choice");
    await curate("weekly", today.weekly, "fx-location");
    await curate("monthly", today.monthly, "fx-set");
    // Yesterday's daily was fx-file, which isn't on any open period now.
    await curate("daily", previousPeriodStart("daily", today.daily), "fx-file");
  });

  it("completes an open period once, with its bonus", async () => {
    const cookie = await signIn("challenger");
    const first = await submitOk("fx-choice", cookie);
    expect(first.challenges).toEqual([{ kind: "daily", bonus: 50 }]);
    expect(first.pointsAwarded).toBe(125 + 50);
    const again = await submitOk("fx-choice", cookie);
    expect(again.challenges).toEqual([]);
    expect(again.pointsAwarded).toBe(0);

    const id = await userIdFor("challenger");
    const response = await getChallenges(id);
    expect(response.current.find((c) => c.kind === "daily")).toMatchObject({ completed: true, status: "solved" });
    expect(response.streak).toMatchObject({ current: 1, completedToday: true });
    expect(response.completedCounts).toEqual({ daily: 1, weekly: 0, monthly: 0 });
  });

  it("awards weekly and monthly separately from daily", async () => {
    const cookie = await signIn("long-hauler");
    expect((await submitOk("fx-location", cookie)).challenges).toEqual([{ kind: "weekly", bonus: 100 }]);
    expect((await submitOk("fx-set", cookie)).challenges).toEqual([{ kind: "monthly", bonus: 200 }]);
    const id = await userIdFor("long-hauler");
    expect((await getChallenges(id)).streak).toMatchObject({ current: 0, longest: 0 });
  });

  it("gives no challenge reward for solving an expired challenge's puzzle", async () => {
    const cookie = await signIn("latecomer");
    const late = await submitOk("fx-file", cookie);
    expect(late.correct).toBe(true);
    expect(late.challenges).toEqual([]);
    expect(late.pointsAwarded).toBe(125);
    const id = await userIdFor("latecomer");
    const { rows } = await getPool().query("select 1 from challenge_completions where user_id = $1", [id]);
    expect(rows).toEqual([]);
    const archive = await getChallengeArchive(id, "daily", null);
    expect(archive.items[0]).toMatchObject({ periodStart: previousPeriodStart("daily", today.daily), completed: false, status: "solved" });
  });

  it("gives no reward for resubmitting a puzzle solved before the period began", async () => {
    await signIn("veteran-solver");
    const id = await userIdFor("veteran-solver");
    // Solved last week: its solution is already open to this user.
    await pastSubmission(id, "fx-choice", true, new Date(Date.now() - 8 * 86_400_000).toISOString());
    const cookie = await signIn("veteran-solver");
    const again = await submitOk("fx-choice", cookie);
    expect(again).toMatchObject({ correct: true, challenges: [], pointsAwarded: 0 });
    const { rows } = await getPool().query("select 1 from challenge_completions where user_id = $1", [id]);
    expect(rows).toEqual([]);
    expect((await getChallenges(id)).current.find((c) => c.kind === "daily")).toMatchObject({
      completed: false,
      status: "solved",
    });
  });

  it("gives no reward for a wrong answer to a challenge", async () => {
    const cookie = await signIn("wrong-challenger");
    const wrong = await submitOk("fx-choice", cookie, { kind: "choice", option: "opt-a" });
    expect(wrong).toMatchObject({ correct: false, challenges: [], pointsAwarded: 0 });
    expect(CORRECT["fx-choice"]).toBeDefined();
  });
});
