-- Design puzzles (spec section 2): a fourth puzzle type. Only the check on puzzles.type changes;
-- answer kinds, grading and grants stay as they are.

alter table puzzles drop constraint puzzles_type_check;
alter table puzzles add constraint puzzles_type_check
  check (type in ('find', 'trace', 'architecture', 'design'));
