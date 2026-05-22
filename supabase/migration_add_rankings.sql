-- Migration: Add rankings and picks_locked columns to users table
-- Run this in your Supabase SQL Editor to update the existing users table

-- Add picks_locked column (defaults to false for existing users)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS picks_locked boolean NOT NULL DEFAULT false;

-- Add rankings column (JSONB for storing team picks)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS rankings jsonb;

-- Optional: Update existing users with empty rankings
UPDATE users 
SET rankings = '[]'::jsonb 
WHERE rankings IS NULL;
