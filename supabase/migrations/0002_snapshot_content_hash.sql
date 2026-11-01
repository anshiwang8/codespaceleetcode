-- A snapshot's SHA never changes, but its index does when the pipeline improves. Seeding compares
-- this hash so a rebuilt snapshot is reloaded instead of leaving the database out of step with the
-- puzzles validated against it.
alter table snapshots add column content_hash text;
