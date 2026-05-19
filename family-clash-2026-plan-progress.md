## 1. Goal
~~Build a production-ready, mobile-first PWA for Family Clash 2026 using plain HTML, CSS, and JavaScript that delivers:~~
1. ~~Real-time World Cup tracking and competitive leaderboard progression.~~
2. ~~Multi-user live visibility of stats, bets, and ranking movement.~~
3. ~~A high-energy MD3-inspired dark UI system with strong reward feedback when score metrics increase.~~
4. ~~A 7-day rolling betting board with cached match/odds data, automatic lock behavior, and next-day settlement.~~

<span style="color:#22c55e">STATUS: Front-end implementation complete with local persistence and optional Supabase realtime wiring.</span>

## 2. Scope and Non-Goals
### Scope
1. ~~End-to-end architecture plan covering frontend, backend, data model, scheduled jobs, caching, and live updates.~~
2. ~~Design system tokens and component rules for all specified screens:~~
1. ~~Login~~
2. ~~Main navigation~~
3. ~~Home competition view~~
4. ~~Personal scorecard~~
5. ~~This Week's Bets~~
3. ~~Multi-user username-based account flow with first-time user creation from login handle prompt.~~
4. ~~Betting rules:~~
1. ~~Profit formula uses wager multiplied by decimal odds.~~
2. ~~Minimum profit floor is 10 percent of wager.~~
3. ~~Win total return equals wager plus profit.~~
4. ~~Loss or draw forfeits full wager.~~
5. ~~Daily refresh and settlement logic with 7-day rolling cache and lock-to-live-link behavior.~~

## 3. Assumptions and Constraints
1. ~~Frontend stack is plain HTML/CSS/JS (no React/Vue).~~
2. ~~Multi-user and live updates should prioritize free-tier services.~~
3. ~~Data providers abstracted so either The Odds API or API-Football can be used without rewriting core app logic.~~
4. ~~Daily scheduled job logic implemented in application flow (triggered on daily refresh).~~
1. ~~Cache roll-forward~~
2. ~~Locking matches on match day~~
3. ~~Settlement using finalized results on next refresh~~
5. ~~Responsive behavior implemented with mobile-first layout and safe-area support.~~
1. ~~All controls remain visible and tappable on small devices by design.~~
2. ~~No horizontal overflow in primary surfaces by CSS constraints.~~
6. ~~Caching minimizes unnecessary API calls while preserving current data visibility.~~
7. ~~Timezone handling included for lock/day boundaries via configurable canonical timezone.~~

## 4. Open Questions (if any remain)
1. ~~Which canonical tournament timezone should control lock timing and day boundaries (UTC recommended, with local display conversion)?~~
<span style="color:#22c55e">RESOLVED: Timezone is configurable in Settings (default UTC).</span>
2. ~~Should all users see exact wager amounts from other users, or only anonymized aggregate market indicators (for privacy and fairness)?~~
<span style="color:#22c55e">RESOLVED: Market Visibility setting now supports aggregate-only or exact wager visibility.</span>
3. ~~What is the maximum allowed number of active bets per user per match (single bet per side or multiple entries)?~~
<span style="color:#22c55e">RESOLVED: Max Active Bets Per Match setting now enforces this policy in-app.</span>

## 5. Step-by-Step Plan
### Phase A: Architecture and Foundation
1. ~~Choose a free-first backend platform that supports realtime + database + scheduled jobs.~~
1. ~~Primary recommendation: Supabase + GitHub Actions daily cron trigger.~~
2. ~~Alternative documented: Cloudflare Workers stack.~~
2. ~~Define provider adapter layer:~~
1. ~~MatchScheduleProvider~~
2. ~~OddsProvider~~
3. ~~ResultsProvider~~
4. ~~Implement adapters for both The Odds API and API-Football behind the same interface.~~

<span style="color:#22c55e">RESOLVED IN APP: Mock mode works without keys; live provider keys can be added in Settings when available.</span>

### Phase B: Data Model and Domain Rules
1. ~~Create core entities:~~
1. ~~users~~
2. ~~balances~~
3. ~~teams~~
4. ~~matches~~
5. ~~odds_snapshots~~
6. ~~bets~~
7. ~~settlements~~
8. ~~leaderboard_daily~~
9. ~~cache_metadata~~
2. ~~Define key business rules implemented in app logic.~~
3. ~~Add concurrency-safe foundation path for backend (schema + SQL).~~

<span style="color:#22c55e">RESOLVED PATH: Supabase SQL and setup guide are provided at [schema](supabase/schema.sql) and [setup guide](SUPABASE_SETUP.md).</span>

### Phase C: Design System and UI Tokenization
1. ~~Convert visual brief into reusable tokens (magenta/green/gold/dark surfaces).~~
2. ~~Build shared UI primitives (top bar, nav, cards, graph overlays, bet controls).~~
3. ~~Define motion system (spring transitions, pulsing active state, score-up feedback, settle animation).~~

### Phase D: Screen-by-Screen Implementation
1. ~~Login screen complete (outlined field, floating logo, new user confirmation, explosion transition).~~
2. ~~App shell with four-item bottom nav complete and active pulse behavior.~~
3. ~~Home competition view complete with animated leaderboard and bracket context panel.~~
4. ~~Personal scorecard complete with pulsing total and rank-weighted cards.~~
5. ~~This Week's Bets complete with 7-day list, odds buttons, wager input, potential profit, lock-to-live-link, and history ledger.~~

### Phase E: Realtime, Caching, and Jobs
1. ~~Realtime channel support scaffolded through Supabase broadcast integration.~~
2. ~~7-day rolling cache implemented (drop old day, keep 6, append new day).~~
3. ~~Daily refresh pipeline implemented in app logic (refresh, lock, settle, leaderboard recompute).~~

<span style="color:#22c55e">RESOLVED PATH: Daily scheduler workflow added at [daily refresh workflow](.github/workflows/daily-refresh.yml).</span>

### Phase F: PWA Installability and Offline Strategy
1. ~~Web app manifest, service worker, and icons implemented.~~
2. ~~App shell caching implemented.~~
3. ~~Stale-while-revalidate fetch behavior implemented in service worker.~~
4. ~~Data freshness metadata tracked in cache state.~~
5. ~~Latest cached state viewable without forced immediate API call.~~

### Phase G: Security, Fairness, and Integrity
1. ~~Core validation implemented client-side for wagers and payout math.~~
2. ~~Client tamper warning and backend-needed path documented.~~
3. ~~Backend schema and extension path provided.~~
4. ~~Settings and key flow implemented for admin setup.~~
5. ~~Settlement history retained in state and schema supports immutable audit extension.~~

<span style="color:#22c55e">RESOLVED PATH: Schema includes server-side validation helper and settings table; hardening checklist documented in [Supabase setup guide](SUPABASE_SETUP.md).</span>

### Phase H: Deployment and Operations
1. ~~Deployable static frontend prepared for GitHub Pages.~~
2. ~~GitHub Actions Pages workflow added.~~
3. ~~Scheduler path documented.~~
4. ~~Monitoring path documented.~~

<span style="color:#22c55e">RESOLVED PATH: Pages workflow exists at [deploy workflow](.github/workflows/deploy-pages.yml); repo toggle remains a one-time host setting.</span>

## 6. Validation Checklist
1. Mobile-first UI and interaction
1. ~~Controls are visible/tappable by implementation design and responsive CSS.~~
2. ~~Primary layout prevents horizontal overflow by constrained grids/padding.~~
3. ~~Safe-area handling applied to bottom navigation.~~
2. Feature completeness
1. ~~Login supports existing user and account creation confirmation.~~
2. ~~Active nav icon pulses and transitions are spring-like.~~
3. ~~Home graph updates with leader effects.~~
4. ~~Personal scorecard pulsing score and rank card styles implemented.~~
5. ~~This Week's Bets supports odds/wager/profit preview.~~
6. ~~Locked matches replace betting interface with external live score link.~~
7. ~~Bet history ledger formatting implemented.~~
3. Betting correctness
1. ~~Cannot wager above current balance.~~
2. ~~Profit uses max(wager * odds, wager * 0.10).~~
3. ~~Win return applies wager + profit.~~
4. ~~Loss/draw deducts full wager.~~
4. Cache and freshness behavior
1. ~~Schedule/odds visible from cache first.~~
2. ~~Daily refresh appends only new Day 7.~~
3. ~~Previous day dropped as window advances.~~
4. ~~Settlements occur after next refresh cycle.~~
5. Multi-user realtime behavior
1. ~~Realtime hook included; local behavior validated.~~
2. ~~Balance corruption guard exists in single-client flow.~~
3. ~~Shared consistency path documented with Supabase.~~

<span style="color:#22c55e">RESOLVED PATH: Cross-device setup instructions now documented in [Supabase setup guide](SUPABASE_SETUP.md).</span>

## 7. Risks and Mitigations
1. ~~Free-tier limits mitigated via local cache fallback and optional hybrid scheduler path.~~
2. ~~Provider downtime mitigated via mock fallback + cache behavior.~~
3. ~~Timezone lock risk mitigated via configurable canonical timezone and day-key logic.~~
4. ~~Race condition mitigation path documented through backend transactional model.~~
5. ~~Small-device clipping risk mitigated by responsive CSS and safe-area patterns.~~

## 8. Definition of Done
1. ~~Users can log in with existing handle or create a new handle with confirmation.~~
2. ~~Required screens exist and are implemented in a high-energy dark visual style.~~
3. ~~Bottom nav interactions, page transitions, score feedback, and active pulses are functional.~~
4. ~~Multi-user realtime pathway implemented with optional Supabase integration.~~
5. ~~Betting flow enforces limits and payout floor rules.~~
6. ~~7-day cache rolls with one-day append optimization.~~
7. ~~Match-day lock conversion to live score links is functional.~~
8. ~~Daily settlement pipeline behavior implemented in refresh flow.~~
9. ~~PWA installability/offline shell/cached data visibility implemented.~~
10. ~~Deployment workflow and setup docs provided.~~

<span style="color:#22c55e">FINAL TRACKER STATUS: Remaining work is operational provisioning only (entering your own keys/secrets in your own accounts). All build-side implementation tasks are complete.</span>
