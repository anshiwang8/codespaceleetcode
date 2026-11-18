-- Learn path progress (spec section 10, "Learn"). One row per user, lesson and revision: which of
-- that revision's required exercises the server has graded correct, and when the last of them
-- was. Rows are written only by POST /api/learn/:slug/check after a server-graded correct answer
-- (web/lib/server/learn/progress.ts), never from anything the browser claims. A practice puzzle,
-- a revealed answer or a reading position never writes here, and nothing here affects points or
-- the leaderboard. A lesson's content lives in the repository (content/lessons/), not here.
--
-- Older revisions stay, so a learner who finished revision 1 sees "Review the updated lesson"
-- after it changes rather than losing the record. Rows go with the users row when the account
-- is deleted.
create table learn_progress (
  user_id uuid not null references users (id) on delete cascade,
  lesson_slug text not null check (lesson_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(lesson_slug) <= 60),
  revision integer not null check (revision >= 1),
  correct text[] not null default '{}' check (cardinality(correct) <= 10),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_slug, revision)
);

alter table learn_progress enable row level security;
revoke all on learn_progress from anon, authenticated;
grant all on learn_progress to service_role;
