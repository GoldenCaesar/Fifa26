-- Migration: Preserve admin coin grants/removals across refreshes

ALTER TABLE users
ADD COLUMN IF NOT EXISTS manual_coin_adjustment NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.manual_coin_adjustment IS 'Net admin-applied coin changes that should persist beyond balance recomputation';