-- Add password_hash column to users table for real password support.
-- Existing accounts will have NULL initially; the hash is set on first login
-- after this migration is applied.
alter table users add column if not exists password_hash text;
