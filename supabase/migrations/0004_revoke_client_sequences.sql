-- 0001 revoked client access to every table, but sequences aren't tables. Hosted Supabase grants
-- anon and authenticated usage and update on each new sequence, and update allows setval, which
-- could wind an id sequence back onto existing rows. Only the server writes, so clients need none.
revoke all on all sequences in schema public from anon, authenticated;
