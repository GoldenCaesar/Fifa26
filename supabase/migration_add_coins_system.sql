-- Migration: Add Coins/Points System Fields
-- Run this SQL in your Supabase SQL Editor to add the new coin-based scoring system

-- Add new columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS team_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bet_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS coins_earned_from_teams INTEGER DEFAULT 0;

-- Update existing users to have starting values
UPDATE users 
SET 
  team_points = 0,
  bet_points = 0,
  coins_earned_from_teams = 0,
  balance = 100
WHERE balance IS NULL OR balance = 2450;

-- Add comment explaining the system
COMMENT ON COLUMN users.team_points IS 'Points earned from team picks only (goals × wins+rank)';
COMMENT ON COLUMN users.bet_points IS 'Points earned from successful bets';
COMMENT ON COLUMN users.coins_earned_from_teams IS 'Cumulative coins earned from team performance (10% of team_points)';
COMMENT ON COLUMN users.balance IS 'Current coin balance for betting (starts at 100)';
COMMENT ON COLUMN users.total_score IS 'Total points = team_points + bet_points (used for ranking)';
