-- Progressive hints, scoring, recurring challenges, achievements and the opt-in leaderboard
-- (spec sections 8 and 10). Every table here belongs to the server: row-level security is on, and
-- clients get no grants at all. Each user-owned row goes with its users row when the account is
-- deleted.

-- Hints are revealed one level at a time through POST /api/puzzles/:slug/hints, which records the
-- reveal before returning the text. Clients could read every hint straight from puzzles.hints
-- under the 0001 column grants, which would make the record meaningless, so that grant goes.
revoke select (hints) on puzzles from anon, authenticated;

create table hint_reveals (
  user_id uuid not null references users (id) on delete cascade,
  puzzle_id bigint not null references puzzles (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  revealed_at timestamptz not null default now(),
  primary key (user_id, puzzle_id, level)
);

-- One period of a recurring challenge and the puzzle everyone gets for it. `period_start` is the
-- UTC date the period begins: any date for daily, a Monday for weekly, the 1st for monthly. Rows
-- are written once, by web/lib/server/challenges.ts, and never change.
create table challenge_assignments (
  period_kind text not null check (period_kind in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  puzzle_id bigint not null references puzzles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (period_kind, period_start),
  check (
    (period_kind <> 'weekly' or extract(isodow from period_start) = 1)
    and (period_kind <> 'monthly' or extract(day from period_start) = 1)
  )
);
create index challenge_assignments_puzzle on challenge_assignments (puzzle_id, period_start);

-- A correct submission to a period's puzzle while that period is open. One per user per period.
create table challenge_completions (
  user_id uuid not null references users (id) on delete cascade,
  period_kind text not null,
  period_start date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, period_kind, period_start),
  foreign key (period_kind, period_start)
    references challenge_assignments (period_kind, period_start) on delete cascade
);
create index challenge_completions_period on challenge_completions (period_kind, period_start);

-- The points ledger. The server writes one 'solve' row the first time a user solves a puzzle and
-- one 'challenge' row per completed challenge period, inside the submission's transaction, and
-- never edits them. Leaderboards sum these rows by earned_at. The point values live in
-- web/lib/scoring.ts; web/tests/scoring.test.ts checks the backfill below uses the same ones.
create table score_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  puzzle_id bigint not null references puzzles (id) on delete cascade,
  kind text not null check (kind in ('solve', 'challenge')),
  period_kind text check (period_kind in ('daily', 'weekly', 'monthly')),
  period_start date,
  base_points integer not null check (base_points >= 0),
  first_try_bonus integer not null default 0 check (first_try_bonus >= 0),
  hint_penalty integer not null default 0 check (hint_penalty >= 0),
  points integer not null check (points >= 0),
  hints_used smallint not null default 0 check (hints_used between 0 and 3),
  first_try boolean not null default false,
  -- True for solves recorded before hints were tracked (this migration): their hint use is unknown.
  backfilled boolean not null default false,
  earned_at timestamptz not null default now(),
  check ((kind = 'solve') = (period_kind is null and period_start is null))
);
create unique index score_events_one_solve on score_events (user_id, puzzle_id) where kind = 'solve';
create unique index score_events_one_challenge
  on score_events (user_id, period_kind, period_start) where kind = 'challenge';
create index score_events_earned_at on score_events (earned_at, user_id);
create index score_events_user on score_events (user_id, earned_at);

-- Achievements a user has earned. The definitions are code (web/lib/achievements.ts); this keeps
-- only which ones were earned and when, so a new badge needs no migration.
create table user_achievements (
  user_id uuid not null references users (id) on delete cascade,
  achievement_id text not null check (achievement_id ~ '^[a-z0-9-]{1,60}$'),
  -- When the activity that earned it happened, which for an older account can predate this row.
  unlocked_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- Leaderboard participation is opt-in: a user appears only while they have a row here, under the
-- public name they chose for it (never their GitHub login). Leaving deletes the row.
create table leaderboard_entries (
  user_id uuid primary key references users (id) on delete cascade,
  public_name text not null check (char_length(public_name) between 2 and 30),
  joined_at timestamptz not null default now()
);
create unique index leaderboard_entries_public_name on leaderboard_entries (lower(public_name));

-- Points for solves made before scoring existed. Base points by difficulty, plus the first-try
-- bonus when the recorded history shows the first graded submission was correct. Hints weren't
-- recorded then, so no hint deduction applies and the row is marked backfilled.
insert into score_events (
  user_id, puzzle_id, kind, base_points, first_try_bonus, hint_penalty, points, hints_used,
  first_try, backfilled, earned_at
)
select
  pr.user_id,
  pr.puzzle_id,
  'solve',
  base.points,
  case when first_sub.correct then 25 else 0 end,
  0,
  greatest(25, base.points + case when first_sub.correct then 25 else 0 end),
  0,
  coalesce(first_sub.correct, false),
  true,
  coalesce(first_correct.created_at, pr.solved_at, now())
from progress pr
join puzzles p on p.id = pr.puzzle_id
cross join lateral (
  select case p.difficulty when 'easy' then 100 when 'medium' then 200 when 'hard' then 300 end as points
) base
left join lateral (
  select s.correct from submissions s
   where s.user_id = pr.user_id and s.puzzle_id = pr.puzzle_id
   order by s.created_at, s.id limit 1
) first_sub on true
left join lateral (
  select s.created_at from submissions s
   where s.user_id = pr.user_id and s.puzzle_id = pr.puzzle_id and s.correct
   order by s.created_at, s.id limit 1
) first_correct on true
where pr.status = 'solved'
on conflict do nothing;

alter table hint_reveals enable row level security;
alter table challenge_assignments enable row level security;
alter table challenge_completions enable row level security;
alter table score_events enable row level security;
alter table user_achievements enable row level security;
alter table leaderboard_entries enable row level security;
revoke all on hint_reveals, challenge_assignments, challenge_completions, score_events,
  user_achievements, leaderboard_entries from anon, authenticated;
revoke all on sequence score_events_id_seq from anon, authenticated;
grant all on hint_reveals, challenge_assignments, challenge_completions, score_events,
  user_achievements, leaderboard_entries to service_role;
grant usage, select on sequence score_events_id_seq to service_role;
