-- Migration: add manual_points_adjustment column to users
-- Run this in the Supabase SQL editor.
--
-- This column lets the admin award or deduct bet-points directly from a user's
-- score, independent of settled bets.  It mirrors the existing
-- manual_coin_adjustment column and is used to correct mis-settled bets
-- (e.g. bets that paid 0 points due to missing odds data at settlement time).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS manual_points_adjustment numeric NOT NULL DEFAULT 0;
