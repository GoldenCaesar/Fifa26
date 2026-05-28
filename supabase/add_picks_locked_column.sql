-- Migration: Add all missing columns to users table
-- Run this in Supabase SQL Editor to fix schema issues

-- Step 1: Add picks_locked column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'picks_locked'
  ) THEN
    ALTER TABLE users ADD COLUMN picks_locked boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'Added picks_locked column';
  END IF;
END $$;

-- Step 2: Add rankings column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'rankings'
  ) THEN
    ALTER TABLE users ADD COLUMN rankings jsonb;
    RAISE NOTICE 'Added rankings column';
  END IF;
END $$;

-- Step 3: Add balance column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'balance'
  ) THEN
    ALTER TABLE users ADD COLUMN balance numeric NOT NULL DEFAULT 2450;
    RAISE NOTICE 'Added balance column';
  END IF;
END $$;

-- Step 4: Add total_score column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'total_score'
  ) THEN
    ALTER TABLE users ADD COLUMN total_score numeric NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added total_score column';
  END IF;
END $$;

-- Step 5: Update existing users who have activity to have picks_locked = true
UPDATE users 
SET picks_locked = true 
WHERE total_score > 0 
  AND picks_locked = false;

-- Step 6: Show current schema and data
SELECT 
  handle, 
  balance,
  total_score,
  picks_locked,
  CASE 
    WHEN rankings IS NULL THEN 0 
    ELSE jsonb_array_length(rankings) 
  END as ranking_count
FROM users 
ORDER BY handle;
