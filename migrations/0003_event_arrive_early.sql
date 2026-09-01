-- Per-event arrive-early override. Paste the whole file into Supabase → SQL editor → Run.
-- Safe to re-run.
--
-- Until now "arrive by" came only from teams.arrive_early_min, so one game could not differ
-- from the rest of the season. This adds the same escape hatch events.duration_min already
-- has: null inherits the team's value, a number overrides it, and 0 drops the arrive-by line
-- for that one game.
alter table events
  add column if not exists arrive_early_min int;

comment on column events.arrive_early_min is
  'Minutes before starts_at to arrive. Null inherits teams.arrive_early_min; 0 means no arrive-by. Games only.';

-- PostgREST caches the schema; without this the new column 404s on the first save.
notify pgrst, 'reload schema';
