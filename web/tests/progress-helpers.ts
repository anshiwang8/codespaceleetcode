import { POST as hintRoute } from "@/app/api/puzzles/[slug]/hints/route";
import { POST as submitRoute } from "@/app/api/puzzles/[slug]/submit/route";
import type { Submission, SubmitResponse } from "@/lib/api-types";
import { getPool } from "@/lib/server/db";
import { CONFIG_FILE, HANDLE_SYMBOL, OTHER_SNAPSHOT_SYMBOL, ROUTER_FILE, STEP_SYMBOL } from "./fixtures";
import { makeRequest, params } from "./helpers";

export const ORIGIN = "http://localhost:3000";

/** A correct answer for every published fixture puzzle. */
export const CORRECT: Record<string, Submission> = {
  "fx-symbol": { kind: "symbol", id: HANDLE_SYMBOL },
  "fx-file": { kind: "file", path: CONFIG_FILE },
  "fx-location": { kind: "location", id: `${CONFIG_FILE}:L3-L4` },
  "fx-sequence": { kind: "sequence", ids: [HANDLE_SYMBOL, STEP_SYMBOL] },
  "fx-set": { kind: "set", ids: [CONFIG_FILE, HANDLE_SYMBOL] },
  "fx-choice": { kind: "choice", option: "opt-b" },
  "fx-other": { kind: "symbol", id: OTHER_SNAPSHOT_SYMBOL },
};

export const WRONG_FILE: Submission = { kind: "file", path: ROUTER_FILE };

export async function submit(slug: string, cookie: string, body: Submission): Promise<Response> {
  return submitRoute(makeRequest(`/api/puzzles/${slug}/submit`, { cookie, body }), params({ slug }));
}

export async function submitOk(slug: string, cookie: string, body: Submission = CORRECT[slug]!): Promise<SubmitResponse> {
  const response = await submit(slug, cookie, body);
  if (response.status !== 200) throw new Error(`submit ${slug} returned ${response.status}`);
  return (await response.json()) as SubmitResponse;
}

export async function reveal(slug: string, cookie: string | undefined, level: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = origin ? { origin } : {};
  return hintRoute(makeRequest(`/api/puzzles/${slug}/hints`, { cookie, headers, body: { level } }), params({ slug }));
}

export async function userIdFor(login: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>("select id from users where github_login = $1", [login]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`no user ${login}`);
  return id;
}

export async function puzzleId(slug: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>("select id from puzzles where slug = $1", [slug]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`no puzzle ${slug}`);
  return id;
}

/** A dated graded submission and the progress it implies, written straight to the tables, for history. */
export async function pastSubmission(userId: string, slug: string, correct: boolean, at: string): Promise<void> {
  const id = await puzzleId(slug);
  const pool = getPool();
  await pool.query(
    "insert into submissions (user_id, puzzle_id, answer_json, correct, created_at) values ($1, $2, '{}', $3, $4)",
    [userId, id, correct, at],
  );
  await pool.query(
    `insert into progress (user_id, puzzle_id, status, attempts, solved_at)
     values ($1, $2, case when $3 then 'solved' else 'attempted' end, 1, case when $3 then $4::timestamptz end)
     on conflict (user_id, puzzle_id) do update set
       attempts = progress.attempts + 1,
       status = case when progress.status = 'solved' or $3 then 'solved' else 'attempted' end,
       solved_at = coalesce(progress.solved_at, case when $3 then $4::timestamptz end)`,
    [userId, id, correct, at],
  );
}
