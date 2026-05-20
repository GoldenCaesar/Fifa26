-- OPTIONAL: Enhanced User Schema for Complete Cloud Backup
-- Run this in Supabase SQL Editor if you want to store full user data (picks, rankings, bets) in the database
-- This is optional - the app works fine with just localStorage + basic user sync

-- Add columns to store user picks and rankings
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS picks_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_picks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rankings jsonb DEFAULT '[]'::jsonb;

-- Create a user_rankings table for better querying (alternative to jsonb column)
CREATE TABLE IF NOT EXISTS user_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team text NOT NULL,
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 5),
  rank_bonus int NOT NULL,
  goals int DEFAULT 0,
  wins int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, rank)
);

-- Add RLS policies for user_rankings
ALTER TABLE user_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_rankings_open_select ON user_rankings;
DROP POLICY IF EXISTS user_rankings_open_write ON user_rankings;

CREATE POLICY user_rankings_open_select ON user_rankings FOR SELECT USING (true);
CREATE POLICY user_rankings_open_write ON user_rankings FOR ALL USING (true) WITH CHECK (true);

-- Create a global team stats table
CREATE TABLE IF NOT EXISTS team_stats (
  team text PRIMARY KEY,
  goals int DEFAULT 0,
  wins int DEFAULT 0,
  draws int DEFAULT 0,
  losses int DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed team stats for all 63 World Cup teams
INSERT INTO team_stats (team) VALUES
  ('Albania'), ('Algeria'), ('Argentina'), ('Australia'), ('Austria'),
  ('Belgium'), ('Bolivia'), ('Brazil'),
  ('Cameroon'), ('Canada'), ('Chile'), ('Colombia'), ('Costa Rica'), ('Croatia'), ('Czech Republic'),
  ('Denmark'), ('DR Congo'),
  ('Ecuador'), ('Egypt'), ('England'),
  ('France'),
  ('Germany'), ('Ghana'), ('Greece'),
  ('Honduras'), ('Hungary'),
  ('Iran'), ('Italy'), ('Ivory Coast'),
  ('Jamaica'), ('Japan'), ('Jordan'),
  ('Mexico'), ('Morocco'),
  ('Netherlands'), ('New Zealand'), ('Nigeria'), ('Norway'),
  ('Panama'), ('Paraguay'), ('Peru'), ('Poland'), ('Portugal'),
  ('Qatar'),
  ('Romania'), ('Russia'),
  ('Saudi Arabia'), ('Senegal'), ('Serbia'), ('Slovakia'), ('Slovenia'), ('South Africa'), ('South Korea'), ('Spain'), ('Sweden'), ('Switzerland'),
  ('Tunisia'), ('Turkey'),
  ('Ukraine'), ('Uruguay'), ('USA'),
  ('Venezuela'),
  ('Wales'),
  ('Iraq')
ON CONFLICT (team) DO NOTHING;

-- Add RLS for team_stats
ALTER TABLE team_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_stats_open_select ON team_stats;
DROP POLICY IF EXISTS team_stats_open_write ON team_stats;

CREATE POLICY team_stats_open_select ON team_stats FOR SELECT USING (true);
CREATE POLICY team_stats_open_write ON team_stats FOR ALL USING (true) WITH CHECK (true);

-- Function to sync user rankings from app
CREATE OR REPLACE FUNCTION upsert_user_rankings(
  p_user_handle text,
  p_rankings jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_ranking jsonb;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id FROM users WHERE handle = p_user_handle;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_user_handle;
  END IF;
  
  -- Delete existing rankings
  DELETE FROM user_rankings WHERE user_id = v_user_id;
  
  -- Insert new rankings
  FOR v_ranking IN SELECT * FROM jsonb_array_elements(p_rankings)
  LOOP
    INSERT INTO user_rankings (user_id, team, rank, rank_bonus, goals, wins)
    VALUES (
      v_user_id,
      v_ranking->>'team',
      (v_ranking->>'rank')::int,
      (v_ranking->>'rankBonus')::int,
      COALESCE((v_ranking->>'goals')::int, 0),
      COALESCE((v_ranking->>'wins')::int, 0)
    );
  END LOOP;
END;
$$;

-- Function to get user rankings
CREATE OR REPLACE FUNCTION get_user_rankings(p_user_handle text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_rankings jsonb;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id FROM users WHERE handle = p_user_handle;
  
  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  
  -- Get rankings as jsonb array
  SELECT jsonb_agg(
    jsonb_build_object(
      'team', team,
      'rank', rank,
      'rankBonus', rank_bonus,
      'goals', goals,
      'wins', wins
    )
    ORDER BY rank
  )
  INTO v_rankings
  FROM user_rankings
  WHERE user_id = v_user_id;
  
  RETURN COALESCE(v_rankings, '[]'::jsonb);
END;
$$;

-- Usage Examples:
-- 
-- 1. Store user rankings:
--    SELECT upsert_user_rankings('testuser1', '[
--      {"team": "Brazil", "rank": 1, "rankBonus": 5, "goals": 12, "wins": 4},
--      {"team": "France", "rank": 2, "rankBonus": 4, "goals": 8, "wins": 3}
--    ]'::jsonb);
--
-- 2. Retrieve user rankings:
--    SELECT get_user_rankings('testuser1');
--
-- 3. View all rankings:
--    SELECT u.handle, ur.team, ur.rank, ur.goals, ur.wins
--    FROM users u
--    JOIN user_rankings ur ON u.id = ur.user_id
--    ORDER BY u.handle, ur.rank;
--
-- 4. Get leaderboard:
--    SELECT handle, total_score, balance
--    FROM users
--    WHERE picks_locked = true
--    ORDER BY total_score DESC;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_user_rankings_user_id ON user_rankings(user_id);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_bets_user_match ON bets(user_id, match_id);
