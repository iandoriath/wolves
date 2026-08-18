create table teams (
  id bigint generated always as identity primary key,
  slug text unique not null,          -- 'softball' | 'soccer'
  name text not null,
  emoji text not null default '',
  announcement text not null default '',
  min_players int not null default 0
);
create table players (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  first_name text not null,
  last_initial text,                  -- null unless needed to disambiguate
  active boolean not null default true
);
create table events (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id),
  kind text not null check (kind in ('game','practice')),
  opponent text,                      -- games only
  starts_at timestamptz not null,
  location text not null default '',
  notes text not null default '',
  cancelled boolean not null default false,
  volunteer_roles text[] not null default '{}'
);
create table rsvps (
  event_id bigint not null references events(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  status text not null check (status in ('going','out')),
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

alter table teams enable row level security;
alter table players enable row level security;
alter table events enable row level security;
alter table rsvps enable row level security;
alter table volunteer_claims enable row level security;
alter table polls enable row level security;
alter table poll_slots enable row level security;
alter table poll_votes enable row level security;

-- everyone can read everything
create policy read_all on teams for select using (true);
create policy read_all on players for select using (true);
create policy read_all on events for select using (true);
create policy read_all on rsvps for select using (true);
create policy read_all on volunteer_claims for select using (true);
create policy read_all on polls for select using (true);
create policy read_all on poll_slots for select using (true);
create policy read_all on poll_votes for select using (true);

-- parents (anon) may write votes, rsvps, claims
create policy anon_write on rsvps for all using (true) with check (true);
create policy anon_write on poll_votes for all using (true) with check (true);
create policy anon_write on volunteer_claims for all using (true) with check (true);

-- coach (authenticated) may write everything else, scoped to the coach's own login
create policy coach_write on teams for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on players for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on events for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on polls for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');
create policy coach_write on poll_slots for all to authenticated using ((auth.jwt()->>'email') = 'idelorey@gmail.com') with check ((auth.jwt()->>'email') = 'idelorey@gmail.com');

insert into teams (slug, name, emoji, min_players) values
  ('softball', 'SAA 10U Wolves', '🥎', 8),
  ('soccer', 'Soccer', '⚽', 7);
