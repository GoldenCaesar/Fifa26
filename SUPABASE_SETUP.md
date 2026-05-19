# Supabase Setup Guide

Complete guide for setting up the multi-user backend with Supabase.

## 1. Create project artifacts

1. Open Supabase project SQL editor.
2. Run [supabase/schema.sql](supabase/schema.sql).
3. Confirm tables were created: `users`, `matches`, `bets`, `cache_metadata`, `app_settings`.

## 2. Deploy Edge Function (REQUIRED for production)

**Important:** The Edge Function fetches odds server-side to keep API keys secure and stay within rate limits.

Follow the complete guide: [Edge Function Deployment](EDGE_FUNCTION_DEPLOYMENT.md)

Quick steps:
1. Install Supabase CLI: `npm install -g supabase`
2. Link project: `supabase link --project-ref pztzduvkbnrutgotdown`
3. Deploy function: `supabase functions deploy daily-refresh`
4. Set secrets (API keys, tokens)
5. Configure GitHub Actions for daily cron

## 3. Test the setup

1. Log into your app
2. Click the refresh button
3. Verify matches appear with real odds
4. Check Supabase database for populated `matches` table

## 4. Daily refresh scheduler

A cron workflow exists at [.github/workflows/daily-refresh.yml](.github/workflows/daily-refresh.yml).

After deploying the Edge Function, set these GitHub repository secrets:

1. `FC26_REFRESH_ENDPOINT`: Your Edge Function URL  
   (e.g., `https://pztzduvkbnrutgotdown.supabase.co/functions/v1/daily-refresh`)
2. `FC26_REFRESH_TOKEN`: Secure token for authentication

This triggers the Edge Function daily at 2:15 AM UTC to fetch new odds.

## 5. Suggested next hardening

1. Replace open RLS policies with user-scoped policies.
2. Move bet placement and settlement calculations to backend RPC/functions only.
3. Add audit log table for immutable settlement history.
4. Add rate limiting at Edge Function endpoint.
5. Implement proper user authentication (currently handle-based only).
