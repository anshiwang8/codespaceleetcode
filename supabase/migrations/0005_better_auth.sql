-- Better Auth replaces Supabase Auth. Its four tables hold users, sessions, linked GitHub accounts
-- and verification tokens. The columns match `betterAuthOptions()` in web/lib/server/better-auth.ts,
-- which is what Better Auth's own schema generator produced for them; change both together.
-- Ids are UUIDs made by the database, so `users.id` can reference `auth_users.id` unchanged.

create table auth_users (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  github_login text
);

create table auth_sessions (
  id uuid default gen_random_uuid() primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  ip_address text,
  user_agent text,
  user_id uuid not null references auth_users (id) on delete cascade
);
create index auth_sessions_user_id_idx on auth_sessions (user_id);

create table auth_accounts (
  id uuid default gen_random_uuid() primary key,
  account_id text not null,
  provider_id text not null,
  user_id uuid not null references auth_users (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null
);
create index auth_accounts_user_id_idx on auth_accounts (user_id);

create table auth_verifications (
  id uuid default gen_random_uuid() primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_verifications_identifier_idx on auth_verifications (identifier);

-- Users created before this migration (dev logins on localhost) keep their ids and progress. Their
-- email is a placeholder on a reserved domain, since Better Auth requires one and they never had one.
insert into auth_users (id, name, email, email_verified, created_at, updated_at, github_login)
select id, github_login, id::text || '@dev-login.invalid', false, created_at, created_at, github_login
from users
on conflict (id) do nothing;

alter table users drop constraint users_id_fkey;
alter table users
  add constraint users_id_fkey foreign key (id) references auth_users (id) on delete cascade;

-- Only the server reads or writes these, through DATABASE_URL. Hosted Supabase would otherwise
-- grant clients everything on them, including session tokens and GitHub access tokens.
alter table auth_users enable row level security;
alter table auth_sessions enable row level security;
alter table auth_accounts enable row level security;
alter table auth_verifications enable row level security;
revoke all on auth_users, auth_sessions, auth_accounts, auth_verifications from anon, authenticated;
grant all on auth_users, auth_sessions, auth_accounts, auth_verifications to service_role;
