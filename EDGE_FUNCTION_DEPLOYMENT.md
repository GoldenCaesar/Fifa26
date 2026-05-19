# Deploying the Odds API Edge Function

This guide walks you through deploying the server-side odds-fetching Edge Function to Supabase.

## Why This is Needed

**Security & API Limits:** Your Odds API and API-Football keys should NEVER be exposed in the browser. The Edge Function:
- Fetches odds server-side once per day (stays within API limits)
- Stores odds in your Supabase database
- Keeps your API keys secure
- Prevents users from exceeding rate limits

## Prerequisites

1. Supabase project created (you already have this)
2. Supabase CLI installed: `npm install -g supabase`
3. Your API keys ready:
   - **Odds API:** `8438501a1cade2b103b78f0d684ffe38`
   - **API-Football (backup):** `785c3e99227eb2cb19a5039aa33cbd8b`

## Step 1: Install Supabase CLI

```powershell
npm install -g supabase
```

## Step 2: Login to Supabase

```powershell
supabase login
```

This opens your browser to authenticate.

## Step 3: Link Your Project

```powershell
supabase link --project-ref <YOUR_PROJECT_REF>
```

Your project ref is in your Supabase URL: `https://[PROJECT_REF].supabase.co`  
For you, it's: `pztzduvkbnrutgotdown`

## Step 4: Deploy the Edge Function

From your project directory:

```powershell
cd C:\Users\thest\Documents\Demicube_Scripting\Fifa26
supabase functions deploy daily-refresh
```

## Step 5: Set Environment Variables (Secrets)

These are stored securely on Supabase and never exposed to clients:

```powershell
# Your primary Odds API key
supabase secrets set ODDS_API_KEY=8438501a1cade2b103b78f0d684ffe38

# Your backup API-Football key
supabase secrets set API_FOOTBALL_KEY=785c3e99227eb2cb19a5039aa33cbd8b

# Your Supabase project URL
supabase secrets set SUPABASE_URL=https://pztzduvkbnrutgotdown.supabase.co

# Your service role key (find in Supabase dashboard > Settings > API)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>

# Create a secure random token for the refresh endpoint
supabase secrets set FC26_REFRESH_TOKEN=<GENERATE_RANDOM_TOKEN_HERE>
```

**To generate a secure token:**
```powershell
# Generate a random 32-character token
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

## Step 6: Get Your Edge Function URL

After deployment, Supabase shows you the function URL. It looks like:
```
https://pztzduvkbnrutgotdown.supabase.co/functions/v1/daily-refresh
```

## Step 7: Set GitHub Secrets for Daily Cron

Go to your GitHub repo → Settings → Secrets and variables → Actions

Add these **three** secrets:

1. **FC26_REFRESH_ENDPOINT**  
   Value: `https://pztzduvkbnrutgotdown.supabase.co/functions/v1/daily-refresh`

2. **FC26_REFRESH_TOKEN**  
   Value: The same token you generated in Step 5 (e.g., `GvKLoVU1ef3t8zExISbAMpr4mk2iZ9HO`)

3. **SUPABASE_ANON_KEY**  
   Value: Your Supabase anon key (the long one starting with `eyJ`)

## Step 8: Test the Edge Function

Test manually first:

```powershell
$TOKEN = "GvKLoVU1ef3t8zExISbAMpr4mk2iZ9HO"
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dHpkdXZrYm5ydXRnb3Rkb3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTEzNDgsImV4cCI6MjA5NDcyNzM0OH0.j1AVRwQbYCf0JryknVtR7NmA2S88nIXhhyfJbRCK01s"
$URL = "https://pztzduvkbnrutgotdown.supabase.co/functions/v1/daily-refresh"

Invoke-RestMethod -Uri $URL -Method Post -Headers @{
  "Authorization" = "Bearer $ANON_KEY"
  "x-refresh-token" = $TOKEN
  "Content-Type" = "application/json"
} -Body '{"source":"manual-test"}'
```

If successful, you'll see:
```json
{
  "success": true,
  "refreshed": ["2026-05-18", "2026-05-19", ...]
}
```

## Step 9: Verify Data in Database

Open Supabase SQL editor and run:

```sql
SELECT * FROM matches ORDER BY day, kickoff_time;
```

You should see matches with real odds populated!

## How It Works

1. **Daily at 2:15 AM UTC**: GitHub Actions triggers the Edge Function
2. **Edge Function**:
   - Checks which days need odds
   - Fetches from Odds API (or API-Football as backup)
   - Stores matches in `matches` table
   - Locks today's matches to prevent betting
3. **Your App**:
   - Reads odds from database (no API calls)
   - Caches locally to minimize database queries
   - Always has fresh odds ready

## Troubleshooting

**Function deployment fails:**
- Make sure you're in the project directory
- Check Supabase CLI is logged in: `supabase status`

**Secrets not working:**
- Verify secrets are set: `supabase secrets list`
- Re-deploy function after setting secrets

**Function returns 401 Unauthorized:**
- Check your `FC26_REFRESH_TOKEN` matches in both Supabase secrets and GitHub secrets

**No matches in database:**
- Check function logs: `supabase functions logs daily-refresh`
- Test the function manually (Step 8)

## Next Steps

Once deployed:
- ✅ Your app fetches odds from database (secure)
- ✅ API calls happen server-side once per day (within limits)
- ✅ API keys are never exposed to users
- ✅ Daily cron keeps odds fresh automatically

Your app is now production-ready! 🎉
