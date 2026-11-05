-- Rate limits shared by every server instance (launch checklist C3). In process memory, each
-- serverless instance kept its own counts, so the real limit was the configured one times the
-- number of instances. web/lib/server/rate-limit.ts counts submits, searches and Better Auth's
-- requests here, one row per key, in fixed windows that start at a key's first request.

create table rate_limits (
  key text primary key,
  count integer not null,
  window_start timestamptz not null
);
-- For pruning old windows.
create index rate_limits_window_start_idx on rate_limits (window_start);

-- Only the server reads or writes this, through DATABASE_URL. Clients never see who is limited.
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;
grant all on rate_limits to service_role;
