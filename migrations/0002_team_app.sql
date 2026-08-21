-- Team app v2 migration. Paste the whole file into Supabase → SQL editor → Run.
-- Safe to re-run.
create extension if not exists pgcrypto;

-- 1. coaches + is_coach()
create table if not exists coaches (email text primary key);
insert into coaches (email) values ('idelorey@gmail.com') on conflict do nothing;
create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coaches c
                 where lower(c.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;

-- 2. invite codes + helpers
create table if not exists team_secrets (
  team_id bigint primary key references teams(id) on delete cascade,
  code text unique not null
);
insert into team_secrets (team_id, code)
  select id, upper(encode(gen_random_bytes(4), 'hex')) from teams
  on conflict do nothing;
create or replace function request_team_codes() returns text[]
language plpgsql stable set search_path = public as $$
declare h text;
begin
  begin
    h := current_setting('request.headers', true)::json->>'x-team-codes';
  exception when others then h := null;
  end;
  if h is null or h = '' then return '{}'::text[]; end if;
  return (select coalesce(array_agg(upper(trim(x))), '{}') from unnest(string_to_array(h, ',')) as x);
end $$;
create or replace function team_code_ok(t bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select is_coach() or exists (
    select 1 from team_secrets s where s.team_id = t and upper(s.code) = any (request_team_codes()));
$$;
create or replace function event_team(e bigint) returns bigint
language sql stable security definer set search_path = public as $$ select team_id from events where id = e $$;
create or replace function slot_team(s bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select p.team_id from poll_slots ps join polls p on p.id = ps.poll_id where ps.id = s $$;

-- 3. teams: new columns; announcement -> posts
alter table teams
  add column if not exists color text not null default '#2d6a4f',
  add column if not exists tz text not null default 'America/New_York',
  add column if not exists default_location text not null default '',
  add column if not exists game_duration_min int not null default 90,
  add column if not exists practice_duration_min int not null default 60,
  add column if not exists arrive_early_min int not null default 30,
  add column if not exists default_volunteer_roles text[] not null default '{}';
create table if not exists posts (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'announcement') then
    insert into posts (team_id, body, pinned)
      select id, announcement, true from teams
      where coalesce(announcement, '') <> ''
        and not exists (select 1 from posts p where p.team_id = teams.id);
    alter table teams drop column announcement;
  end if;
end $$;

-- 4. events
alter table events drop constraint if exists events_kind_check;
alter table events add constraint events_kind_check check (kind in ('game','practice','other'));
alter table events
  add column if not exists title text not null default '',
  add column if not exists time_tbd boolean not null default false,
  add column if not exists duration_min int,
  add column if not exists home boolean,
  add column if not exists status text not null default 'scheduled',
  add column if not exists status_note text not null default '',
  add column if not exists rescheduled_from timestamptz,
  add column if not exists score_us int,
  add column if not exists score_them int,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table events drop constraint if exists events_status_check;
alter table events add constraint events_status_check check (status in ('scheduled','tentative','cancelled'));
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'cancelled') then
    update events set status = 'cancelled' where cancelled;
    alter table events drop column cancelled;
  end if;
end $$;

-- 5. rsvps
alter table rsvps drop constraint if exists rsvps_status_check;
alter table rsvps add constraint rsvps_status_check check (status in ('going','maybe','out'));
alter table rsvps add column if not exists note text not null default '';
alter table rsvps drop constraint if exists rsvps_note_len;
alter table rsvps add constraint rsvps_note_len check (char_length(note) <= 80);

-- 6. contacts
create table if not exists player_contacts (
  player_id bigint primary key references players(id) on delete cascade,
  parent_name text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default ''
);

-- 7. triggers
create or replace function set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists events_updated_at on events;
create trigger events_updated_at before update on events for each row execute function set_updated_at();
drop trigger if exists rsvps_updated_at on rsvps;
create trigger rsvps_updated_at before insert or update on rsvps for each row execute function set_updated_at();

-- 8. RLS
alter table teams enable row level security;
alter table players enable row level security;
alter table player_contacts enable row level security;
alter table events enable row level security;
alter table rsvps enable row level security;
alter table volunteer_claims enable row level security;
alter table polls enable row level security;
alter table poll_slots enable row level security;
alter table poll_votes enable row level security;
alter table posts enable row level security;
alter table team_secrets enable row level security;
alter table coaches enable row level security;

drop policy if exists read_all on teams;           drop policy if exists read_all on players;
drop policy if exists read_all on events;          drop policy if exists read_all on rsvps;
drop policy if exists read_all on volunteer_claims; drop policy if exists read_all on polls;
drop policy if exists read_all on poll_slots;      drop policy if exists read_all on poll_votes;
drop policy if exists anon_write on rsvps;         drop policy if exists anon_write on poll_votes;
drop policy if exists anon_write on volunteer_claims;
drop policy if exists coach_write on teams;        drop policy if exists coach_write on players;
drop policy if exists coach_write on events;       drop policy if exists coach_write on polls;
drop policy if exists coach_write on poll_slots;
drop policy if exists read_public on teams;        drop policy if exists read_public on events;
drop policy if exists read_public on polls;        drop policy if exists read_public on poll_slots;
drop policy if exists read_code on players;        drop policy if exists read_code on posts;
drop policy if exists write_code on rsvps;         drop policy if exists write_code on volunteer_claims;
drop policy if exists write_code on poll_votes;
drop policy if exists coach_all on teams;          drop policy if exists coach_all on players;
drop policy if exists coach_all on player_contacts; drop policy if exists coach_all on events;
drop policy if exists coach_all on rsvps;          drop policy if exists coach_all on volunteer_claims;
drop policy if exists coach_all on polls;          drop policy if exists coach_all on poll_slots;
drop policy if exists coach_all on poll_votes;     drop policy if exists coach_all on posts;
drop policy if exists coach_read on team_secrets;  drop policy if exists coach_update on team_secrets;
drop policy if exists coach_read on coaches;

create policy read_public on teams for select using (true);
create policy read_public on events for select using (true);
create policy read_public on polls for select using (true);
create policy read_public on poll_slots for select using (true);
create policy read_code on players for select using (team_code_ok(team_id));
create policy read_code on posts for select using (team_code_ok(team_id));
create policy write_code on rsvps for all
  using (team_code_ok(event_team(event_id))) with check (team_code_ok(event_team(event_id)));
create policy write_code on volunteer_claims for all
  using (team_code_ok(event_team(event_id))) with check (team_code_ok(event_team(event_id)));
create policy write_code on poll_votes for all
  using (team_code_ok(slot_team(slot_id))) with check (team_code_ok(slot_team(slot_id)));
create policy coach_all on teams for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on players for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on player_contacts for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on events for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on rsvps for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on volunteer_claims for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on polls for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on poll_slots for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on poll_votes for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_all on posts for all to authenticated using (is_coach()) with check (is_coach());
create policy coach_read on team_secrets for select to authenticated using (is_coach());
create policy coach_update on team_secrets for update to authenticated using (is_coach()) with check (is_coach());
create policy coach_read on coaches for select to authenticated using (is_coach());

-- 9. done — read your invite codes:
-- select t.slug, s.code from teams t join team_secrets s on s.team_id = t.id;
