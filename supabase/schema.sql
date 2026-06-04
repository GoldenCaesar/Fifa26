-- Family Clash 2026 baseline schema
-- Run in Supabase SQL editor if you want true shared multi-user persistence.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  balance numeric not null default 2450,
  manual_coin_adjustment numeric not null default 0,
  total_score numeric not null default 2450,
  picks_locked boolean not null default false,
  rankings jsonb,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id text primary key,
  day date not null,
  kickoff_time text not null,
  home_team text not null,
  away_team text not null,
  odds_home numeric not null,
  odds_away numeric not null,
  status text not null,
  result_home int,
  result_away int,
  winner text,
  tournament_group text,
  updated_at timestamptz not null default now()
);

create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  match_id text not null references matches(id) on delete cascade,
  pick text not null,
  odds numeric not null,
  wager numeric not null,
  status text not null default 'active',
  outcome text not null default 'pending',
  delta numeric not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists cache_metadata (
  id int primary key default 1,
  last_refresh_ymd date,
  last_refreshed_at timestamptz,
  source text,
  note text
);

create table if not exists app_settings (
  id int primary key default 1,
  market_visibility text not null default 'aggregate',
  max_active_bets_per_match int not null default 1,
  updated_at timestamptz not null default now()
);

insert into cache_metadata (id) values (1)
on conflict (id) do nothing;

insert into app_settings (id) values (1)
on conflict (id) do nothing;

alter table users enable row level security;
alter table matches enable row level security;
alter table bets enable row level security;
alter table cache_metadata enable row level security;
alter table app_settings enable row level security;

-- MVP open policies (tighten before production):
drop policy if exists users_open_select on users;
drop policy if exists users_open_write on users;
drop policy if exists matches_open_select on matches;
drop policy if exists matches_open_write on matches;
drop policy if exists bets_open_select on bets;
drop policy if exists bets_open_write on bets;
drop policy if exists cache_open_select on cache_metadata;
drop policy if exists cache_open_write on cache_metadata;
drop policy if exists app_settings_open_select on app_settings;
drop policy if exists app_settings_open_write on app_settings;

create policy users_open_select on users for select using (true);
create policy users_open_write on users for all using (true) with check (true);
create policy matches_open_select on matches for select using (true);
create policy matches_open_write on matches for all using (true) with check (true);
create policy bets_open_select on bets for select using (true);
create policy bets_open_write on bets for all using (true) with check (true);
create policy cache_open_select on cache_metadata for select using (true);
create policy cache_open_write on cache_metadata for all using (true) with check (true);
create policy app_settings_open_select on app_settings for select using (true);
create policy app_settings_open_write on app_settings for all using (true) with check (true);

-- Optional server-side validation helper for future RPC-based bet placement.
create or replace function validate_active_bets(
  p_user_id uuid,
  p_match_id text,
  p_limit int
)
returns boolean
language sql
as $$
  select count(*) < p_limit
  from bets
  where user_id = p_user_id
    and match_id = p_match_id
    and status = 'active';
$$;
