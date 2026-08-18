-- Scope the coach_write policies to the coach's own login.
-- Paste this into the Supabase SQL editor for the already-deployed database.

drop policy coach_write on teams;
drop policy coach_write on players;
drop policy coach_write on events;
drop policy coach_write on polls;
drop policy coach_write on poll_slots;

create policy coach_write on teams for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on players for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on events for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on polls for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on poll_slots for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
