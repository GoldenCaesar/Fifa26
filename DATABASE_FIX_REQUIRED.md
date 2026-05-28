# 🚨 CRITICAL FIX REQUIRED: Database Missing picks_locked Column

## Problem
Your Supabase database is **missing the `picks_locked` column** in the users table. This causes:
- ❌ Error: `Could not find the 'picks_locked' column of 'users' in the schema cache`
- ❌ Users can't save their team picks properly
- ❌ Returning users are forced to pick teams again
- ❌ Cannot delete users (crashes)

## Solution: Run Database Migration

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project: `pztzduvkbnrutgotdown`
3. Click **SQL Editor** in left sidebar
4. Click **New Query**

### Step 2: Run This SQL Migration
Copy and paste this entire SQL block:

```sql
-- Migration: Add all missing columns to users table

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

-- Step 5: Update existing users who have activity
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
```

### Step 3: Click "RUN" Button
- You should see: `Added picks_locked column to users table`
- Then a table showing all users with their `picks_locked` status

### Step 4: Verify
The query results should show:
- **steve**: `picks_locked = true` (has 245 points)
- Other users with activity: `picks_locked = true`
- New users: `picks_locked = false`

---

## After Running Migration

### ✅ What Will Work:
- Users can pick teams and save properly
- Returning users skip team picking screen
- Admin can delete users without crashes
- Database syncs `picks_locked` status correctly

### 🧪 Test:
1. Clear cache and refresh app
2. Log in as "steve"
3. Should skip team picking and go straight to app
4. Admin can delete users successfully

---

## Why This Happened
The `users` table in your Supabase database was created **before** the `picks_locked` column was added to the schema. The table needs to be migrated to include this new column.

---

## Alternative: Recreate Table (⚠️ Destroys Data)
If you want to start fresh (this will **delete all users**):

```sql
-- WARNING: This deletes all user data!
DROP TABLE IF EXISTS users CASCADE;

-- Recreate with full schema
CREATE TABLE users (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  balance numeric not null default 2450,
  total_score numeric not null default 2450,
  picks_locked boolean not null default false,
  rankings jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS (optional)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON users FOR ALL USING (true);
```

---

## Files Created
- ✅ Fixed `deleteUser()` function to handle missing leaderboard/bets
- ✅ Created migration file: `supabase/add_picks_locked_column.sql`
- ✅ Created this instruction guide

Run the migration and the app will work perfectly! 🎯
