-- Giving up was removed: a solution now unlocks only after a correct answer. Earlier give-ups become
-- plain attempts, so `solved` and `attempted` are the only statuses left.
update progress set status = 'attempted' where status = 'given_up';
alter table progress drop constraint progress_status_check;
alter table progress add constraint progress_status_check check (status in ('attempted', 'solved'));
alter table progress drop column gave_up;
