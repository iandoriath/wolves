-- wolves.glorbnorb.com — fresh schema (team app v2). For the already-deployed DB use migrations/.
create extension if not exists pgcrypto;

create table teams (
  id bigint generated always as identity primary key,
  slug text unique not null,                       -- 'softball' | 'soccer'
  name text not null,
  emoji text not null default '',
  color text not null default '#2d6a4f',
  tz text not null default 'America/New_York',
  min_players int not null default 0,
  default_location text not null default '',
  game_duration_min int not null default 90,
  practice_duration_min int not null default 60,
  arrive_early_min int not null default 30,
  default_volunteer_roles text[] not null default '{}'
);
create table players (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  first_name text not null,
  last_initial text,
  active boolean not null default true
);
create table player_contacts (                     -- coach-only
  player_id bigint primary key references players(id) on delete cascade,
  parent_name text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default ''
);
create table events (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  kind text not null check (kind in ('game','practice','other')),
  title text not null default '',                  -- used when kind = 'other'
  opponent text,                                   -- games
  starts_at timestamptz not null,
  time_tbd boolean not null default false,
  duration_min int,                                -- null -> team default by kind
  arrive_early_min int,                            -- games: null -> team default, 0 -> no arrive-by
  location text not null default '',
  home boolean,                                    -- games: true home, false away, null unknown
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','tentative','cancelled')),
  status_note text not null default '',
  rescheduled_from timestamptz,
  volunteer_roles text[] not null default '{}',
  score_us int,
  score_them int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table rsvps (
  event_id bigint not null references events(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  status text not null check (status in ('going','maybe','out')),
  note text not null default '' constraint rsvps_note_len check (char_length(note) <= 80),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);
create table volunteer_claims (
  event_id bigint not null references events(id) on delete cascade,
  role text not null,
  player_id bigint not null references players(id) on delete cascade,
  primary key (event_id, role)
);
create table polls (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  title text not null,
  status text not null default 'open' check (status in ('open','closed'))
);
create table poll_slots (
  id bigint generated always as identity primary key,
  poll_id bigint not null references polls(id) on delete cascade,
  starts_at timestamptz not null
);
create table poll_votes (
  slot_id bigint not null references poll_slots(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  choice text not null check (choice in ('yes','no','ifneeded')),
  primary key (slot_id, player_id)
);
create table posts (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create table team_secrets (
  team_id bigint primary key references teams(id) on delete cascade,
  code text unique not null
);
create table coaches (email text primary key);

-- ---------- helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger events_updated_at before update on events for each row execute function set_updated_at();
create trigger rsvps_updated_at before insert or update on rsvps for each row execute function set_updated_at();

create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coaches c
                 where lower(c.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;

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

-- ---------- RLS ----------
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

-- public schedule
create policy read_public on teams for select using (true);
create policy read_public on events for select using (true);
create policy read_public on polls for select using (true);
create policy read_public on poll_slots for select using (true);
-- people data behind the team code
create policy read_code on players for select using (team_code_ok(team_id));
create policy read_code on posts for select using (team_code_ok(team_id));
create policy write_code on rsvps for all
  using (team_code_ok(event_team(event_id))) with check (team_code_ok(event_team(event_id)));
create policy write_code on volunteer_claims for all
  using (team_code_ok(event_team(event_id))) with check (team_code_ok(event_team(event_id)));
create policy write_code on poll_votes for all
  using (team_code_ok(slot_team(slot_id))) with check (team_code_ok(slot_team(slot_id)));
-- coach
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

-- ---------- seed ----------
insert into coaches (email) values ('idelorey@gmail.com');
insert into teams (slug, name, emoji, min_players, default_volunteer_roles) values
  ('softball', 'SAA 10U Wolves', '🥎', 8, '{Snacks}'),
  ('soccer', 'Soccer', '⚽', 7, '{}');
insert into team_secrets (team_id, code)
  select id, upper(encode(gen_random_bytes(4), 'hex')) from teams;
