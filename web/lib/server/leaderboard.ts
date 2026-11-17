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

interface RankedJson {
  user_id: string;
  points: number;
  solved: number;
  reached_at: string;
  public_name: string;
  rank: number;
}

interface BoardRow {
  total: number;
  rows: RankedJson[];
  you_rank: string | null;
  you_name: string | null;
  you_points: number;
  you_solved: number;
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
  if (userId) await reconcileSolves(userId);

  const offset = (page - 1) * LEADERBOARD_PAGE_SIZE;
  // One statement, so the ranking is computed once for the page, the count and the viewer's own
  // rank, where three separate queries computed it three times. The viewer's own totals count
  // even when they haven't joined; they're shown only to them. With nobody signed in, $5 is null
  // and the viewer's parts come back empty.
  const { rows } = await getPool().query<BoardRow>(
    `${RANKED}
     select (select count(*)::int from ranked) as total,
            coalesce(
              (select json_agg(json_build_object(
                        'user_id', user_id, 'points', points, 'solved', solved, 'reached_at', reached_at,
                        'public_name', public_name, 'rank', rank) order by position)
                 from ranked where position > $3 and position <= $3 + $4),
              '[]'::json) as rows,
            (select rank::text from ranked where user_id = $5::uuid) as you_rank,
            (select public_name from leaderboard_entries where user_id = $5::uuid) as you_name,
            (select coalesce(sum(points), 0)::int from score_events
              where user_id = $5::uuid
                and ($1::timestamptz is null or earned_at >= $1)
                and ($2::timestamptz is null or earned_at < $2)) as you_points,
            (select (count(*) filter (where kind = 'solve'))::int from score_events
              where user_id = $5::uuid
                and ($1::timestamptz is null or earned_at >= $1)
                and ($2::timestamptz is null or earned_at < $2)) as you_solved`,
    [...bounds, offset, LEADERBOARD_PAGE_SIZE, userId],
  );
  const board = rows[0];
  const you: LeaderboardYou | null = userId
    ? {
        participating: board?.you_name != null,
        publicName: board?.you_name ?? null,
        rank: board?.you_rank == null ? null : Number(board.you_rank),
        points: board?.you_points ?? 0,
        solved: board?.you_solved ?? 0,
      }
    : null;

  return {
    period,
    range: range ? { startsAt: range.startsAt, endsAt: range.endsAt } : null,
    now: at.toISOString(),
    page,
    pageSize: LEADERBOARD_PAGE_SIZE,
    totalEntries: board?.total ?? 0,
    rows: (board?.rows ?? []).map(
      (row): LeaderboardRow => ({
        rank: Number(row.rank),
        publicName: row.public_name,
        points: row.points,
        solved: row.solved,
        reachedAt: new Date(row.reached_at).toISOString(),
        isYou: row.user_id === userId,
      }),
    ),
    you,
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
