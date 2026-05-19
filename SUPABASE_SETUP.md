# Supabase Setup (Complete Remaining Notes)

Use this to complete shared multi-user persistence with your existing Supabase account.

## 1. Create project artifacts

1. Open Supabase project SQL editor.
2. Run [supabase/schema.sql](supabase/schema.sql).
3. Confirm tables were created: `users`, `matches`, `bets`, `cache_metadata`.

## 2. Configure app settings

In app Settings screen:

1. Set `Supabase URL` and `Supabase Anon Key`.
2. Set `Market Visibility` to `aggregate` or `exact`.
3. Set `Max Active Bets Per Match` (recommended `1`).
4. Save settings.

## 3. Provider setup (optional)

If you want live odds instead of mock mode:

1. Choose provider `odds-api` or `api-football`.
2. Paste provider API key.
3. Save settings.

## 4. Daily refresh scheduler

A cron workflow exists at [daily refresh workflow](.github/workflows/daily-refresh.yml).

Set GitHub repository secrets:

1. `FC26_REFRESH_ENDPOINT`: HTTPS endpoint for your backend refresh function.
2. `FC26_REFRESH_TOKEN`: bearer token expected by that endpoint.

You can host this endpoint as a Supabase Edge Function.

## 5. Suggested next hardening

1. Replace open RLS policies with user-scoped policies.
2. Move all bet placement and settlement calculations to backend RPC/functions only.
3. Add audit log table for immutable settlement history.
4. Add rate limiting at backend endpoint.
