-- Core schema from spec section 8. Runs unchanged on hosted Supabase and on the local database,
-- where supabase/local/shim.sql first creates the roles and auth schema Supabase provides.

create extension if not exists pg_trgm;

create table repos (
  id bigint generated always as identity primary key,
  slug text not null unique,
  url text not null,
  language text not null,
  license text not null
);

create table snapshots (
  id bigint generated always as identity primary key,
  repo_id bigint not null references repos (id) on delete cascade,
  sha text not null check (sha ~ '^[0-9a-f]{40}$'),
  name text not null unique, -- <slug>@<sha>, the folder name under /snapshots/
  manifest_url text not null,
  indexed_at timestamptz not null default now(),
  unique (repo_id, sha)
);

create table files (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references snapshots (id) on delete cascade,
  path text not null,
  size integer not null,
  language text not null,
  content text not null,
  unique (snapshot_id, path)
);
create index files_content_trgm on files using gin (content gin_trgm_ops);

create table symbols (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references snapshots (id) on delete cascade,
  file_id bigint not null references files (id) on delete cascade,
  symbol_id text not null, -- canonical ID: path#Qualified.name[~N]
  name text not null,
  kind text not null,
  start_line integer not null,
  end_line integer not null,
  unique (snapshot_id, symbol_id)
);
create index symbols_file on symbols (file_id, start_line);

create table occurrences (
  symbol_pk bigint not null references symbols (id) on delete cascade,
  file_id bigint not null references files (id) on delete cascade,
  line integer not null, -- 1-based
  col integer not null, -- 1-based, UTF-16 units
  end_col integer not null, -- exclusive
  role text not null check (role in ('definition', 'reference'))
);
create index occurrences_position on occurrences (file_id, line, col);
create index occurrences_symbol on occurrences (symbol_pk);

create table call_edges (
  snapshot_id bigint not null references snapshots (id) on delete cascade,
  caller_symbol_id text not null,
  callee_symbol_id text not null,
  primary key (snapshot_id, caller_symbol_id, callee_symbol_id)
);

create table puzzles (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references snapshots (id) on delete cascade,
  slug text not null unique,
  type text not null check (type in ('find', 'trace', 'architecture')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  title text not null,
  prompt text not null,
  answer_kind text not null
    check (answer_kind in ('symbol', 'file', 'location', 'sequence', 'set', 'choice')),
  answer_json jsonb not null, -- the key: readable only with the service role
  set_count integer,
  choices jsonb, -- [{id, label}] for choice puzzles: labels only, never which one is correct
  hints jsonb not null default '[]',
  tags text[] not null default '{}',
  verified_by text[] not null default '{}',
  published boolean not null default false
);

create table solutions (
  puzzle_id bigint primary key references puzzles (id) on delete cascade,
  body_md text not null
);

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  github_login text not null unique,
  created_at timestamptz not null default now()
);

create table submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  puzzle_id bigint not null references puzzles (id) on delete cascade,
  answer_json jsonb not null, -- what the user submitted, not the key
  correct boolean not null,
  created_at timestamptz not null default now(),
  time_on_puzzle_ms integer
);
create index submissions_user_puzzle on submissions (user_id, puzzle_id);

create table progress (
  user_id uuid not null references users (id) on delete cascade,
  puzzle_id bigint not null references puzzles (id) on delete cascade,
  status text not null check (status in ('attempted', 'solved', 'given_up')),
  attempts integer not null default 0,
  solved_at timestamptz,
  gave_up boolean not null default false,
  primary key (user_id, puzzle_id)
);

-- Row-level security. The service role bypasses all of this; clients get only what's below.
alter table repos enable row level security;
alter table snapshots enable row level security;
alter table files enable row level security;
alter table symbols enable row level security;
alter table occurrences enable row level security;
alter table call_edges enable row level security;
alter table puzzles enable row level security;
alter table solutions enable row level security;
alter table users enable row level security;
alter table submissions enable row level security;
alter table progress enable row level security;

create policy public_read on repos for select to anon, authenticated using (true);
create policy public_read on snapshots for select to anon, authenticated using (true);
create policy public_read on files for select to anon, authenticated using (true);
create policy public_read on symbols for select to anon, authenticated using (true);
create policy public_read on occurrences for select to anon, authenticated using (true);
create policy public_read on call_edges for select to anon, authenticated using (true);
create policy published_read on puzzles for select to anon, authenticated using (published);
create policy own_read on users for select to authenticated using (id = auth.uid());
create policy own_read on submissions for select to authenticated using (user_id = auth.uid());
create policy own_read on progress for select to authenticated using (user_id = auth.uid());
-- solutions has no policy: RLS denies every client read.

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select on repos, snapshots, files, symbols, occurrences, call_edges to anon, authenticated;
-- Column grants leave out puzzles.answer_json, so it can't be selected even on a visible row.
grant select (
  id, snapshot_id, slug, type, difficulty, title, prompt, answer_kind, set_count, choices, hints,
  tags, verified_by, published
) on puzzles to anon, authenticated;
grant select on users, submissions, progress to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
