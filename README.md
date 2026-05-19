# Family Clash 2026 PWA

Mobile-first installable PWA inspired by the provided design system. Built with plain HTML/CSS/JS and deployable to GitHub Pages.

## Included

- Login with handle recognition + first-time account creation prompt
- Bottom navigation with spring-like transitions and active neon pulse
- Home competition view with animated multi-user leaderboard chart + bracket panel
- Personal scorecard with pulsing total score and rank-weighted team cards
- This Week's Bets screen with 7-day rolling schedule, dynamic potential profit, lock behavior, and bet history
- Settings screen for admin/provider keys and realtime credentials
- Settings controls for market visibility and max active bets per match
- Local 7-day cache logic with daily roll-forward
- Daily lock + settlement simulation in app state
- Installable PWA assets: manifest + service worker + icons

## Run locally

Because this uses a service worker, run from a local web server (not file://).

Example with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In GitHub repo settings, enable Pages source as GitHub Actions.
3. Push to `main`; workflow `.github/workflows/deploy-pages.yml` deploys automatically.

## Optional live data providers

Odds are fetched **server-side** via Supabase Edge Function to:
- Keep API keys secure (never exposed to browser)
- Stay within API rate limits (500/month for Odds API)
- Fetch odds once per day automatically

See [Edge Function Deployment Guide](EDGE_FUNCTION_DEPLOYMENT.md) for setup instructions.

The app reads odds from the Supabase `matches` table and caches locally for performance.

## Optional Supabase realtime

In Settings, add:

- Supabase URL
- Supabase anon key

Then run the schema in `supabase/schema.sql`.

This app currently uses broadcast channels for basic realtime update signaling and local storage for app state. To make true multi-user persistent state, wire CRUD operations to Supabase tables and row-level security.

See [Supabase setup guide](SUPABASE_SETUP.md) for end-to-end setup steps.

## Betting math

- Profit = `max(wager * odds, wager * 0.10)`
- Win return = `wager + profit`
- Loss or draw = lose full wager
- Wager cannot exceed current balance

## Known constraints

- True multi-device persistence and authoritative settlement require backend table writes and scheduled jobs.
- Provider APIs can have rate limits and CORS restrictions when called directly from browser.

## Scheduled refresh workflow

A daily cron workflow exists at [daily refresh workflow](.github/workflows/daily-refresh.yml).

Configure these GitHub repository secrets before enabling:

- `FC26_REFRESH_ENDPOINT`
- `FC26_REFRESH_TOKEN`
