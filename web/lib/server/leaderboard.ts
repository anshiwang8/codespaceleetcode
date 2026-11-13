import "server-only";
import type { LeaderboardParticipation, LeaderboardResponse, LeaderboardRow, LeaderboardYou } from "@/lib/api-types";
import { leaderboardRange, type LeaderboardPeriod } from "@/lib/periods";
import { databaseNow } from "@/lib/server/challenges";
import { getPool } from "@/lib/server/db";
import { reconcileSolves } from "@/lib/server/scores";

// Rankings sum the points ledger (score_events) over a period, for users who joined the
// leaderboard (leaderboard_entries) only. Nobody appears without opting in, and a row carries the
// public name they chose, never their login, email, picture or GitHub id.
//
// Order: more points first; on equal points, whoever reached that total first (their latest
// scoring event in the period is earlier); then the public name and the user id, so the order is
// total and stable. Rank is shared only by exactly equal points and time.

export const LEADERBOARD_PAGE_SIZE = 25;
export const MAX_LEADERBOARD_PAGE = 400;

const RANKED = `
  with totals as (
    select e.user_id, sum(e.points)::int as points,
           (count(*) filter (where e.kind = 'solve'))::int as solved,
           max(e.earned_at) as reached_at
      from score_events e
      join leaderboard_entries l on l.user_id = e.user_id
     where ($1::timestamptz is null or e.earned_at >= $1)
       and ($2::timestamptz is null or e.earned_at < $2)
     group by e.user_id
  ), ranked as (
    select t.user_id, t.points, t.solved, t.reached_at, l.public_name,
           rank() over (order by t.points desc, t.reached_at) as rank,
           row_number() over (order by t.points desc, t.reached_at, l.public_name, t.user_id) as position
      from totals t
      join leaderboard_entries l on l.user_id = t.user_id
     where t.points > 0
  )`;

interface RankedRow {
  user_id: string;
  points: number;
  solved: number;
  reached_at: Date;
  public_name: string;
  rank: string;
}

export async function getLeaderboard(
  userId: string | null,
  period: LeaderboardPeriod,
  page: number,
  now?: Date,
): Promise<LeaderboardResponse> {
  const at = now ?? (await databaseNow());
  const range = leaderboardRange(period, at);
  const bounds = [range?.startsAt ?? null, range?.endsAt ?? null];
  const pool = getPool();
  if (userId) await reconcileSolves(userId);

  const offset = (page - 1) * LEADERBOARD_PAGE_SIZE;
  const [pageRows, count, you] = await Promise.all([
    pool.query<RankedRow>(
      `${RANKED}
       select user_id, points, solved, reached_at, public_name, rank from ranked
        where position > $3 and position <= $3 + $4
        order by position`,
      [...bounds, offset, LEADERBOARD_PAGE_SIZE],
    ),
    pool.query<{ count: number }>(`${RANKED} select count(*)::int as count from ranked`, bounds),
    userId ? getYou(userId, bounds) : Promise.resolve(null),
  ]);

  const rows = pageRows.rows.map(
    (row): LeaderboardRow => ({
      rank: Number(row.rank),
      publicName: row.public_name,
      points: row.points,
      solved: row.solved,
      reachedAt: row.reached_at.toISOString(),
      isYou: row.user_id === userId,
    }),
  );
  return {
    period,
    range: range ? { startsAt: range.startsAt, endsAt: range.endsAt } : null,
    now: at.toISOString(),
    page,
    pageSize: LEADERBOARD_PAGE_SIZE,
    totalEntries: count.rows[0]?.count ?? 0,
    rows,
    you,
  };
}

/** The signed-in user's own standing. Their private totals show to them even when they haven't joined. */
async function getYou(userId: string, bounds: (string | null)[]): Promise<LeaderboardYou> {
  const pool = getPool();
  const [entry, own, ranked] = await Promise.all([
    pool.query<{ public_name: string }>("select public_name from leaderboard_entries where user_id = $1", [userId]),
    pool.query<{ points: number; solved: number }>(
      `select coalesce(sum(points), 0)::int as points,
              (count(*) filter (where kind = 'solve'))::int as solved
         from score_events
        where user_id = $3
          and ($1::timestamptz is null or earned_at >= $1)
          and ($2::timestamptz is null or earned_at < $2)`,
      [...bounds, userId],
    ),
    pool.query<{ rank: string }>(`${RANKED} select rank from ranked where user_id = $3`, [...bounds, userId]),
  ]);
  const publicName = entry.rows[0]?.public_name ?? null;
  const rank = ranked.rows[0]?.rank;
  return {
    participating: publicName !== null,
    publicName,
    rank: rank === undefined ? null : Number(rank),
    points: own.rows[0]?.points ?? 0,
    solved: own.rows[0]?.solved ?? 0,
  };
}

/** A leaderboard_entries row, or nothing when the user hasn't joined. */
export function participationFrom(row: { public_name: string; joined_at: Date } | undefined): LeaderboardParticipation {
  return {
    participating: row !== undefined,
    publicName: row?.public_name ?? null,
    joinedAt: row?.joined_at.toISOString() ?? null,
  };
}

export async function getParticipation(userId: string): Promise<LeaderboardParticipation> {
  const { rows } = await getPool().query<{ public_name: string; joined_at: Date }>(
    "select public_name, joined_at from leaderboard_entries where user_id = $1",
    [userId],
  );
  return participationFrom(rows[0]);
}

export type JoinResult = { state: "ok"; participation: LeaderboardParticipation } | { state: "name_taken" };

/** Joins, or renames while joined. The name was checked with publicNameField first. */
export async function joinLeaderboard(userId: string, publicName: string): Promise<JoinResult> {
  try {
    await getPool().query(
      `insert into leaderboard_entries (user_id, public_name) values ($1, $2)
       on conflict (user_id) do update set public_name = excluded.public_name`,
      [userId, publicName],
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return { state: "name_taken" };
    }
    throw error;
  }
  return { state: "ok", participation: await getParticipation(userId) };
}

/** Leaves the leaderboard. Points stay on the account, visible only to its owner. */
export async function leaveLeaderboard(userId: string): Promise<LeaderboardParticipation> {
  await getPool().query("delete from leaderboard_entries where user_id = $1", [userId]);
  return { participating: false, publicName: null, joinedAt: null };
}
