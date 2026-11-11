import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteMe } from "@/app/api/me/route";
import { DELETE as leaveRoute, GET as participationRoute, PUT as joinRoute } from "@/app/api/me/leaderboard/route";
import { GET as boardRoute } from "@/app/api/leaderboard/route";
import type { LeaderboardResponse } from "@/lib/api-types";
import { publicNameField } from "@/lib/leaderboard-name";
import { getPool } from "@/lib/server/db";
import { getLeaderboard, LEADERBOARD_PAGE_SIZE } from "@/lib/server/leaderboard";
import { resetRateLimits } from "@/lib/server/rate-limit";
import { seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, signIn } from "./helpers";
import { ORIGIN, puzzleId, userIdFor } from "./progress-helpers";

describe("publicNameField", () => {
  it("accepts ordinary names and trims them", () => {
    expect(publicNameField("  Ada L.  ")).toEqual({ ok: true, value: "Ada L." });
    expect(publicNameField("José_99")).toEqual({ ok: true, value: "José_99" });
  });

  it("refuses names that mix alphabets, and folds look-alike forms", () => {
    expect(publicNameField("\u0410lice").ok).toBe(false); // Cyrillic А
    expect(publicNameField("Ad\u03b1").ok).toBe(false); // Greek alpha
    expect(publicNameField("Ｊｏｓé").ok && publicNameField("Ｊｏｓé")).toEqual({ ok: true, value: "José" });
    expect(publicNameField("Борис").ok).toBe(true);
    expect(publicNameField("山田たろう").ok).toBe(true);
    expect(publicNameField("Ada 42").ok).toBe(true);
  });

  it("refuses short, long, empty and unusual names", () => {
    for (const value of ["", "a", "x".repeat(31), "<script>", "a\nb", "-dash", "name!", "‮evil", 42, null]) {
      expect(publicNameField(value).ok, String(value)).toBe(false);
    }
  });
});

const NOW = new Date("2026-11-11T12:00:00Z");

async function award(userId: string, slug: string, points: number, at: string): Promise<void> {
  await getPool().query(
    `insert into score_events (user_id, puzzle_id, kind, base_points, points, earned_at)
     values ($1, $2, 'solve', $3, $3, $4)`,
    [userId, await puzzleId(slug), points, at],
  );
}

async function join(cookie: string, publicName: string): Promise<Response> {
  return joinRoute(
    makeRequest("/api/me/leaderboard", { method: "PUT", cookie, headers: { origin: ORIGIN }, body: { publicName } }),
    undefined,
  );
}

async function leave(cookie: string): Promise<Response> {
  return leaveRoute(makeRequest("/api/me/leaderboard", { method: "DELETE", cookie, headers: { origin: ORIGIN } }), undefined);
}

describe.skipIf(!hasDatabase)("leaderboard", () => {
  const users: Record<string, { cookie: string; id: string }> = {};

  beforeAll(async () => {
    await seedFixtures();
    for (const login of ["lb-ana", "lb-bo", "lb-cy", "lb-private"]) {
      const cookie = await signIn(login);
      users[login] = { cookie, id: await userIdFor(login) };
    }
    // ana and bo tie on points; bo got there first. cy scored only yesterday.
    await award(users["lb-ana"]!.id, "fx-file", 200, "2026-11-11T09:00:00Z");
    await award(users["lb-bo"]!.id, "fx-file", 200, "2026-11-11T08:00:00Z");
    await award(users["lb-cy"]!.id, "fx-file", 300, "2026-11-10T20:00:00Z");
    await award(users["lb-private"]!.id, "fx-file", 900, "2026-11-11T07:00:00Z");
  });
  beforeEach(async () => {
    await resetRateLimits();
  });

  it("is private by default: nobody appears without joining", async () => {
    const board = await getLeaderboard(null, "all", 1, NOW);
    expect(board.rows).toEqual([]);
    expect(board.totalEntries).toBe(0);
    const mine = await getLeaderboard(users["lb-private"]!.id, "all", 1, NOW);
    expect(mine.you).toEqual({ participating: false, publicName: null, rank: null, points: 900, solved: 1 });
  });

  it("ranks people who joined, breaking ties by who reached the total first", async () => {
    expect((await join(users["lb-ana"]!.cookie, "Ana")).status).toBe(200);
    expect((await join(users["lb-bo"]!.cookie, "Bo")).status).toBe(200);
    expect((await join(users["lb-cy"]!.cookie, "Cy")).status).toBe(200);

    const all = await getLeaderboard(users["lb-ana"]!.id, "all", 1, NOW);
    expect(all.rows.map((r) => [r.rank, r.publicName, r.points, r.isYou])).toEqual([
      [1, "Cy", 300, false],
      [2, "Bo", 200, false],
      [3, "Ana", 200, true],
    ]);
    expect(all.you).toMatchObject({ participating: true, publicName: "Ana", rank: 3, points: 200 });

    const today = await getLeaderboard(null, "daily", 1, NOW);
    expect(today.rows.map((r) => r.publicName)).toEqual(["Bo", "Ana"]);
    expect(today.range).toEqual({ startsAt: "2026-11-11T00:00:00.000Z", endsAt: "2026-11-12T00:00:00.000Z" });
    const week = await getLeaderboard(null, "weekly", 1, NOW);
    expect(week.rows.map((r) => r.publicName)).toEqual(["Cy", "Bo", "Ana"]);
  });

  it("shows only public names: no login, user id or private player", async () => {
    const response = await boardRoute(makeRequest("/api/leaderboard?period=all"), undefined);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const login of Object.keys(users)) expect(text).not.toContain(login);
    for (const { id } of Object.values(users)) expect(text).not.toContain(id);
    expect(text).not.toContain("900");
    const body = JSON.parse(text) as LeaderboardResponse;
    expect(Object.keys(body.rows[0] ?? {}).sort()).toEqual(["isYou", "points", "publicName", "rank", "reachedAt", "solved"]);
  });

  it("refuses a name someone else has, ignoring case, and bad names", async () => {
    const taken = await join(users["lb-private"]!.cookie, "ana");
    expect(taken.status).toBe(409);
    const bad = await join(users["lb-private"]!.cookie, "x");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ fields: { publicName: expect.any(String) } });
    const participation = await participationRoute(makeRequest("/api/me/leaderboard", { cookie: users["lb-private"]!.cookie }), undefined);
    expect(await participation.json()).toMatchObject({ participating: false });
  });

  it("removes someone at once when they leave, keeping their points private", async () => {
    expect((await leave(users["lb-cy"]!.cookie)).status).toBe(200);
    const board = await getLeaderboard(users["lb-cy"]!.id, "all", 1, NOW);
    expect(board.rows.map((r) => r.publicName)).toEqual(["Bo", "Ana"]);
    expect(board.you).toMatchObject({ participating: false, rank: null, points: 300 });
  });

  it("drops a deleted account's entry and points", async () => {
    const cookie = await signIn("lb-gone");
    const id = await userIdFor("lb-gone");
    await award(id, "fx-choice", 500, "2026-11-11T10:00:00Z");
    expect((await join(cookie, "Gone")).status).toBe(200);
    expect((await getLeaderboard(null, "all", 1, NOW)).rows[0]?.publicName).toBe("Gone");
    const response = await deleteMe(
      makeRequest("/api/me", { method: "DELETE", cookie, headers: { origin: ORIGIN }, body: { confirm: "DELETE" } }),
      undefined,
    );
    expect(response.status).toBe(200);
    expect((await getLeaderboard(null, "all", 1, NOW)).rows.map((r) => r.publicName)).not.toContain("Gone");
  });

  it("pages through many players in a stable order", async () => {
    const pool = getPool();
    const count = LEADERBOARD_PAGE_SIZE + 5;
    for (let i = 0; i < count; i++) {
      const login = `lb-many-${i}`;
      await signIn(login);
      const id = await userIdFor(login);
      await pool.query("insert into leaderboard_entries (user_id, public_name) values ($1, $2)", [id, `Many ${i}`]);
      // Equal points and equal times: only the name decides, so the order is still total.
      await award(id, "fx-location", 10, "2026-11-11T11:00:00Z");
    }
    const page1 = await getLeaderboard(null, "daily", 1, NOW);
    const page2 = await getLeaderboard(null, "daily", 2, NOW);
    expect(page1.rows).toHaveLength(LEADERBOARD_PAGE_SIZE);
    const names = [...page1.rows, ...page2.rows].map((r) => r.publicName);
    expect(new Set(names).size).toBe(names.length);
    expect(page1.totalEntries).toBe(page1.rows.length + page2.rows.length);
    const tied = [...page1.rows, ...page2.rows].filter((r) => r.points === 10);
    expect(new Set(tied.map((r) => r.rank)).size).toBe(1);
  });

  it("validates the query and refuses cross-site changes", async () => {
    for (const query of ["period=yearly", "page=0", "page=abc", "page=401", "extra=1"]) {
      expect((await boardRoute(makeRequest(`/api/leaderboard?${query}`), undefined)).status, query).toBe(400);
    }
    const cross = await joinRoute(
      makeRequest("/api/me/leaderboard", {
        method: "PUT",
        cookie: users["lb-private"]!.cookie,
        headers: { origin: "https://evil.example" },
        body: { publicName: "Sneaky" },
      }),
      undefined,
    );
    expect(cross.status).toBe(403);
    expect((await joinRoute(makeRequest("/api/me/leaderboard", { method: "PUT", headers: { origin: ORIGIN }, body: { publicName: "Anon" } }), undefined)).status).toBe(401);
  });
});
