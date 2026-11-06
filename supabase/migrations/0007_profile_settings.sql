-- Editable profile details, appearance preferences, uploaded avatars, and a verified contact email.
--
-- Each is kept apart from the authentication tables (auth_users and friends from 0005), which keep
-- the immutable GitHub identity: Better Auth may rewrite auth_users.name, image and its placeholder
-- email on every GitHub sign-in, and nothing here reads them. Every row belongs to one users row and
-- goes with it when the account is deleted. Only the server reads or writes these tables.

-- Optional details the user may set and clear. All nullable.
create table user_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  pronouns text check (pronouns is null or char_length(pronouns) between 1 and 40),
  bio text check (bio is null or char_length(bio) between 1 and 280),
  -- A calendar date with no time or zone. Never shown as an age or used for anything else.
  birthday date check (birthday is null or birthday >= date '1900-01-01'),
  -- Optional links, validated by the server before they're stored (web/lib/server/settings.ts).
  links jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object' and pg_column_size(links) <= 8192),
  updated_at timestamptz not null default now()
);

-- Appearance. theme_id is a codebases theme ID; mode 'system' follows the device.
create table user_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  theme_mode text check (theme_mode in ('theme', 'system')),
  theme_id text check (theme_id is null or theme_id ~ '^[a-z0-9-]{1,40}$'),
  favorite_themes text[] not null default '{}' check (cardinality(favorite_themes) <= 200),
  updated_at timestamptz not null default now(),
  check ((theme_mode = 'theme') = (theme_id is not null))
);

-- One re-encoded square WebP per user, at most 128 KB, served only to its owner. `version` changes
-- with every upload, so a new picture never hides behind a cached old one.
create table user_avatars (
  user_id uuid primary key references users (id) on delete cascade,
  image bytea not null check (octet_length(image) <= 131072),
  content_type text not null check (content_type = 'image/webp'),
  version text not null check (version ~ '^[0-9a-f]{16}$'),
  updated_at timestamptz not null default now()
);

-- The verified contact email: the only email codebases treats as real. auth_users.email stays the
-- placeholder Better Auth needs and is never shown. One account per address.
create table user_emails (
  user_id uuid primary key references users (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  verified_at timestamptz not null
);
create unique index user_emails_email_key on user_emails (lower(email));

-- Pending verifications. Only a SHA-256 hash of each token is kept. A token works once, before it
-- expires, for the user and purpose it was made for.
create table email_verifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  purpose text not null check (purpose in ('setup', 'change')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index email_verifications_user_id_idx on email_verifications (user_id);

alter table user_profiles enable row level security;
alter table user_preferences enable row level security;
alter table user_avatars enable row level security;
alter table user_emails enable row level security;
alter table email_verifications enable row level security;
revoke all on user_profiles, user_preferences, user_avatars, user_emails, email_verifications from anon, authenticated;
revoke all on sequence email_verifications_id_seq from anon, authenticated;
grant all on user_profiles, user_preferences, user_avatars, user_emails, email_verifications to service_role;
grant usage, select on sequence email_verifications_id_seq to service_role;
