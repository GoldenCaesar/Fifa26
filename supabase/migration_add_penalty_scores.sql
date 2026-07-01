alter table matches
  add column if not exists result_home_penalties int,
  add column if not exists result_away_penalties int;