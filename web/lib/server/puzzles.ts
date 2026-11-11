import "server-only";
import { z } from "zod";
import {
  PUZZLE_TYPES,
  type AnswerKind,
  type ChoiceOption,
  type Difficulty,
  type PuzzleDetail,
  type PuzzleListResponse,
  type PuzzleStatus,
  type PuzzleSummary,
  type PuzzleType,
  type StatsResponse,
} from "@/lib/api-types";
import { getPool } from "@/lib/server/db";
import { parseHints } from "@/lib/server/hints";
import { PERIOD_KINDS, periodStart, type PeriodKind } from "@/lib/periods";

// Nothing in this file may read the answer key. Only submit.ts does.

// Parsing drops any field other than id and label, so a stray "correct" flag in the seed data
// can't reach a client.
export const choicesSchema = z
  .array(z.object({ id: z.string(), label: z.string() }))
  .nullable() satisfies z.ZodType<ChoiceOption[] | null>;

export interface PuzzleFilters {
  type?: PuzzleType;
  difficulty?: Difficulty;
  repo?: string;
  tag?: string;
}

interface SummaryRow {
  slug: string;
  type: PuzzleType;
  difficulty: Difficulty;
  title: string;
  repo_slug: string;
  language: string;
  tags: string[];
  status: PuzzleStatus;
}

function toSummary(row: SummaryRow): PuzzleSummary {
  return {
    slug: row.slug,
    type: row.type,
    difficulty: row.difficulty,
    title: row.title,
    repoSlug: row.repo_slug,
    language: row.language,
    tags: row.tags,
    status: row.status,
  };
}

export async function listPuzzles(
  userId: string | null,
  filters: PuzzleFilters,
): Promise<PuzzleListResponse> {
  const pool = getPool();
  const [puzzles, repos, tags] = await Promise.all([
    pool.query<SummaryRow>(
      `select p.slug, p.type, p.difficulty, p.title, r.slug as repo_slug, r.language, p.tags,
              coalesce(pr.status, 'unsolved') as status
         from puzzles p
         join snapshots s on s.id = p.snapshot_id
         join repos r on r.id = s.repo_id
         left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1
        where p.published
          and ($2::text is null or p.type = $2)
          and ($3::text is null or p.difficulty = $3)
          and ($4::text is null or r.slug = $4)
          and ($5::text is null or $5 = any (p.tags))
        order by p.id`,
      [userId, filters.type ?? null, filters.difficulty ?? null, filters.repo ?? null, filters.tag ?? null],
    ),
    pool.query<{ slug: string }>(
      `select distinct r.slug
         from puzzles p
         join snapshots s on s.id = p.snapshot_id
         join repos r on r.id = s.repo_id
        where p.published
        order by r.slug`,
    ),
    pool.query<{ tag: string }>(
      "select distinct unnest(tags) as tag from puzzles where published order by tag",
    ),
  ]);
  return {
    puzzles: puzzles.rows.map(toSummary),
    repos: repos.rows.map((row) => row.slug),
    tags: tags.rows.map((row) => row.tag),
  };
}

interface DetailRow extends SummaryRow {
  prompt: string;
  answer_kind: AnswerKind;
  set_count: number | null;
  choices: unknown;
  hints: unknown;
  hints_revealed: number;
  featured_in: PeriodKind[];
  verified_by: string[];
  attempts: number;
  snapshot_id: string;
  snapshot_name: string;
  sha: string;
  repo_url: string;
  license: string;
  manifest_url: string;
}

/** Published puzzles for the sitemap, dated by when their snapshot was last indexed. */
export async function listSitemapPuzzles(): Promise<{ slug: string; lastModified: Date }[]> {
  const { rows } = await getPool().query<{ slug: string; indexed_at: Date }>(
    `select p.slug, s.indexed_at
       from puzzles p
       join snapshots s on s.id = p.snapshot_id
      where p.published
      order by p.slug`,
  );
  return rows.map((row) => ({ slug: row.slug, lastModified: row.indexed_at }));
}

export async function getPuzzleDetail(
  userId: string | null,
  slug: string,
): Promise<PuzzleDetail | null> {
  const { rows } = await getPool().query<DetailRow>(
    `select p.slug, p.type, p.difficulty, p.title, p.prompt, p.answer_kind, p.set_count, p.choices,
            p.hints, p.tags, p.verified_by,
            (select count(*)::int from hint_reveals h where h.puzzle_id = p.id and h.user_id = $1)
              as hints_revealed,
            array(select a.period_kind from challenge_assignments a
                   where a.puzzle_id = p.id
                     and (a.period_kind, a.period_start) in (
                       select u.kind, u.start from unnest($3::text[], $4::date[]) as u(kind, start))
                   order by array_position($3::text[], a.period_kind)) as featured_in,
            coalesce(pr.status, 'unsolved') as status, coalesce(pr.attempts, 0) as attempts,
            s.id as snapshot_id, s.name as snapshot_name, s.sha, s.manifest_url,
            r.slug as repo_slug, r.url as repo_url, r.license, r.language
       from puzzles p
       join snapshots s on s.id = p.snapshot_id
       join repos r on r.id = s.repo_id
       left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1
      where p.slug = $2 and p.published`,
    // The server's clock, for a link only: whether a submission completes a challenge is decided
    // on the database's clock when it's graded.
    [userId, slug, [...PERIOD_KINDS], PERIOD_KINDS.map((kind) => periodStart(kind, new Date()))],
  );
  const row = rows[0];
  if (!row) return null;
  // Only revealed hints leave the server; the rest stay behind POST /api/puzzles/:slug/hints.
  const hints = parseHints(row.hints);
  return {
    ...toSummary(row),
    prompt: row.prompt,
    answerKind: row.answer_kind,
    setCount: row.set_count,
    choices: choicesSchema.parse(row.choices),
    hintCount: hints.length,
    revealedHints: hints.slice(0, userId ? row.hints_revealed : 0),
    featuredIn: row.featured_in,
    verifiedBy: row.verified_by,
    attempts: row.attempts,
    snapshot: {
      id: Number(row.snapshot_id),
      name: row.snapshot_name,
      sha: row.sha,
      repoSlug: row.repo_slug,
      repoUrl: row.repo_url,
      license: row.license,
      language: row.language,
      manifestUrl: row.manifest_url,
    },
  };
}

export type SolutionResult = { state: "not_found" } | { state: "locked" } | { state: "ok"; bodyMd: string };

export async function getSolution(userId: string, slug: string): Promise<SolutionResult> {
  const pool = getPool();
  const puzzle = await pool.query<{ id: string; status: string | null }>(
    `select p.id, pr.status
       from puzzles p
       left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1
      where p.slug = $2 and p.published`,
    [userId, slug],
  );
  const row = puzzle.rows[0];
  if (!row) return { state: "not_found" };
  if (row.status !== "solved") return { state: "locked" };
  const solution = await pool.query<{ body_md: string }>(
    "select body_md from solutions where puzzle_id = $1",
    [row.id],
  );
  const body = solution.rows[0]?.body_md;
  return body === undefined ? { state: "not_found" } : { state: "ok", bodyMd: body };
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Counts puzzles with status `solved`. */
export async function getStats(userId: string): Promise<StatsResponse> {
  const { rows } = await getPool().query<{
    type: PuzzleType;
    difficulty: Difficulty;
    total: number;
    solved: number;
  }>(
    `select p.type, p.difficulty, count(*)::int as total,
            (count(*) filter (where pr.status = 'solved'))::int as solved
       from puzzles p
       left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1
      where p.published
      group by p.type, p.difficulty`,
    [userId],
  );
  const stats: StatsResponse = {
    solved: 0,
    total: 0,
    byType: Object.fromEntries(
      PUZZLE_TYPES.map((type) => [type, { solved: 0, total: 0 }]),
    ) as StatsResponse["byType"],
    byDifficulty: Object.fromEntries(
      DIFFICULTIES.map((difficulty) => [difficulty, { solved: 0, total: 0 }]),
    ) as StatsResponse["byDifficulty"],
  };
  for (const row of rows) {
    stats.solved += row.solved;
    stats.total += row.total;
    stats.byType[row.type].solved += row.solved;
    stats.byType[row.type].total += row.total;
    stats.byDifficulty[row.difficulty].solved += row.solved;
    stats.byDifficulty[row.difficulty].total += row.total;
  }
  return stats;
}
