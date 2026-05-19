## 1. Goal
Build a production-ready, mobile-first PWA for Family Clash 2026 using plain HTML, CSS, and JavaScript that delivers:
1. Real-time World Cup tracking and competitive leaderboard progression.
2. Multi-user live visibility of stats, bets, and ranking movement.
3. A high-energy MD3-inspired dark UI system with strong reward feedback when score metrics increase.
4. A 7-day rolling betting board with cached match/odds data, automatic lock behavior, and next-day settlement.

## 2. Scope and Non-Goals
### Scope
1. End-to-end architecture plan covering frontend, backend, data model, scheduled jobs, caching, and live updates.
2. Design system tokens and component rules for all specified screens:
1. Login
2. Main navigation
3. Home competition view
4. Personal scorecard
5. This Week’s Bets
3. Multi-user username-based account flow with first-time user creation from login handle prompt.
4. Betting rules:
1. Profit formula uses wager multiplied by decimal odds.
2. Minimum profit floor is 10 percent of wager.
3. Win total return equals wager plus profit.
4. Loss or draw forfeits full wager.
5. Daily refresh and settlement logic with 7-day rolling cache and lock-to-live-link behavior.

### Non-Goals
1. Native mobile app build (iOS/Android binaries).
2. Deep account security hardening beyond MVP-safe baseline.
3. Paid analytics, paid push infrastructure, or enterprise observability.
4. Full bookmaker compliance and regional legal workflows (must be reviewed later if monetized).

## 3. Assumptions and Constraints
1. Frontend stack is plain HTML/CSS/JS (no React/Vue).
2. Multi-user and live updates should prioritize free-tier services.
3. Data providers should be abstracted so either The Odds API or API-Football can be used without rewriting core app logic.
4. Daily scheduled job is required for:
1. Cache roll-forward
2. Locking matches on match day
3. Settlement using finalized results on next refresh
5. Responsive behavior is a top acceptance criterion:
1. All controls remain visible and tappable on small devices.
2. No horizontal overflow for primary interaction surfaces.
6. Caching must minimize unnecessary API calls while preserving current data visibility.
7. Timezone handling must be explicit to prevent early or late bet locks.

## 4. Open Questions (if any remain)
1. Which canonical tournament timezone should control lock timing and day boundaries (UTC recommended, with local display conversion)?
2. Should all users see exact wager amounts from other users, or only anonymized aggregate market indicators (for privacy and fairness)?
3. What is the maximum allowed number of active bets per user per match (single bet per side or multiple entries)?

## 5. Step-by-Step Plan
### Phase A: Architecture and Foundation
1. Choose a free-first backend platform that supports realtime + database + scheduled jobs.
1. Primary recommendation: Supabase (Postgres, Realtime, Auth substitute via custom username table, Edge Functions) plus GitHub Actions for daily cron trigger if native scheduling is limited.
2. Alternative: Cloudflare Workers + D1 + Cron + Durable Objects if you prefer single-vendor edge stack.
2. Define provider adapter layer:
1. MatchScheduleProvider
2. OddsProvider
3. ResultsProvider
4. Implement adapters for both The Odds API and API-Football behind the same interface.

### Phase B: Data Model and Domain Rules
1. Create core entities:
1. users
2. balances
3. teams
4. matches
5. odds_snapshots
6. bets
7. settlements
8. leaderboard_daily
9. cache_metadata
2. Define key business rules:
1. Username login creates account on first unknown handle after confirmation.
2. Wager validation enforces wager less than or equal to current balance.
3. Profit equals max(wager multiplied by odds, wager multiplied by 0.10).
4. Win return equals wager plus profit; loss or draw equals minus wager.
5. Lock state activates at 00:00 match date in canonical timezone (or exact kickoff, if selected later).
6. Locked matches replace betting inputs with external Google Live Scores link.
3. Add optimistic concurrency checks for balance updates to avoid double-spend race conditions.

### Phase C: Design System and UI Tokenization
1. Convert visual brief into reusable tokens:
1. Primary: electric magenta
2. Secondary success: neon green
3. Highlight: bright gold
4. Surface defaults: deep navy/charcoal
5. Typography hierarchy with aggressive geometric sans style emphasis
2. Build shared UI primitives:
1. Top app bar
2. Bottom nav with active neon pulse ring
3. Card variants (glass, platinum, bronze, standard)
4. Graph overlays (leader aura, rank-up arrows, particle bursts)
5. Bet controls (odds chips, wager input, potential profit panel)
3. Define motion system:
1. Spring slide transitions between tabs
2. Pulsing active icon states
3. Score-up reward animations
4. Metal-thud settle animation for ranking card reorder events

### Phase D: Screen-by-Screen Implementation
1. Login screen:
1. Single large outlined handle field
2. Floating pulsing football logo
3. Recognized user path to entry transition
4. New user prompt and account creation confirmation
5. Magenta explosion transition into app shell
2. App shell with bottom navigation:
1. Home
2. My Rankings
3. Standings
4. Settings
5. Active tab pulse + spring transition
3. Home competition view:
1. Realtime multi-line leaderboard graph
2. Dynamic climb updates
3. Rank crossover effects with particles and rank-up indicators
4. Gold-outlined current leader avatar
5. Tournament bracket context panel
4. Personal scorecard:
1. Large pulsing total score
2. Top 5 rank-weighted team cards with platinum to bronze treatment
3. Visualized scoring flow from goals and rank bonus to total
4. Settle animation and optional sound cue on ranking updates
5. This Week’s Bets:
1. Chronological 7-day list
2. Per match odds buttons and wager input
3. Dynamic potential profit preview
4. Submit flow with validation and live updates
5. Locked-day conversion to Google Live Scores external link
6. Bet history ledger with result formatting and red negative outcomes

### Phase E: Realtime, Caching, and Jobs
1. Realtime channels:
1. New bet events
2. Balance changes
3. Leaderboard changes
4. Match lock state updates
2. Implement 7-day rolling cache strategy:
1. Store day-partitioned schedule and odds snapshots.
2. Daily refresh removes completed day.
3. Shift remaining six days logically.
4. Fetch exactly one new out-day and append.
5. Record cache generation timestamp and provider source metadata.
3. Daily scheduled pipeline:
1. Refresh matches and odds for next 7 days.
2. Lock current-day matches for betting.
3. Pull finalized results for completed matches.
4. Settle active bets.
5. Move settled bets to history.
6. Recompute leaderboard and publish realtime updates.

### Phase F: PWA Installability and Offline Strategy
1. Add web app manifest, service worker, and install prompts.
2. Cache shell and most recent data snapshot for fast startup.
3. Stale-while-revalidate behavior for schedule and leaderboard lists.
4. Display last-updated timestamps to communicate freshness.
5. Ensure users can view latest cached state without forced API request loops.

### Phase G: Security, Fairness, and Integrity
1. Server-side validation for all wager and settlement calculations.
2. Prevent client-side tampering by ignoring client-computed payout.
3. Add idempotency keys for bet placement and settlement jobs.
4. Rate limit login handle creation and bet submission endpoints.
5. Keep immutable settlement audit records.

### Phase H: Deployment and Operations
1. Deploy static frontend to free hosting.
2. Deploy backend endpoints and realtime infrastructure.
3. Configure daily scheduler and health checks.
4. Add basic monitoring:
1. Job success/failure alerts
2. API quota tracking
3. Cache hit/miss dashboard
4. Prepare rollback path for odds provider outages.

## 6. Validation Checklist
1. Mobile-first UI and interaction
1. All primary buttons are fully visible and tappable at small viewport widths.
2. No horizontal overflow in login, cards, nav, graphs, and betting forms.
3. Safe-area handling for bottom navigation and notches.
2. Feature completeness
1. Login supports existing user entry and new user creation confirmation.
2. Active nav icon pulses and screen transitions are spring-like.
3. Home graph updates in realtime with leader effects.
4. Personal scorecard shows pulsing total and rank-weighted card styles.
5. This Week’s Bets supports odds selection, wager entry, and potential profit preview.
6. Locked matches replace betting interface with external live score link.
7. Bet history displays win/loss outcome ledger formatting.
3. Betting correctness
1. Cannot wager above current balance.
2. Profit equals max(wager multiplied by odds, wager multiplied by 0.10).
3. Win return equals wager plus profit.
4. Loss or draw deducts full wager.
4. Cache and freshness behavior
1. Schedule and odds are visible from cache without unnecessary immediate refetch.
2. Daily refresh only requests the new Day 7 segment.
3. Previous day is dropped and six-day window is retained.
4. Settlements appear after next daily refresh.
5. Multi-user realtime behavior
1. Users see live bet and leaderboard changes.
2. Concurrent betting does not corrupt balances.
3. Live state consistency is maintained across clients.

## 7. Risks and Mitigations
1. Risk: Free-tier limits on realtime or scheduled functions.
1. Mitigation: Use a hybrid scheduler (GitHub Actions calling backend endpoint), throttle broadcast frequency, and batch non-critical updates.
2. Risk: Odds/match provider downtime or rate caps.
1. Mitigation: Provider abstraction with failover option, cached fallback snapshots, and stale-data banners.
3. Risk: Timezone lock bugs causing unfair bet windows.
1. Mitigation: Single canonical timezone in backend, explicit conversion utility, and lock-state integration tests.
4. Risk: Race conditions on balance when many bets are placed.
1. Mitigation: Transactional updates, row locking or equivalent, and idempotent endpoint design.
5. Risk: Small-device clipping or overflow in dense data screens.
1. Mitigation: strict responsive QA matrix and overflow guards in all card/graph layouts.

## 8. Definition of Done
1. Users can log in with existing handle or create a new handle with confirmation.
2. All required screens exist, are visually aligned to the high-energy dark design system, and are fully usable on small mobile screens without overflow issues.
3. Bottom nav interactions, page transitions, score-up feedback, and active-state pulses function as specified.
4. Multi-user realtime updates show cross-user stats and betting activity according to chosen visibility policy.
5. Betting flow enforces balance limits and settles with the defined profit floor and payout rules.
6. 7-day cache rolls forward daily with one-day append fetch optimization.
7. Match-day lock conversion to external live score links works automatically.
8. Daily settlement pipeline moves bets from active to history and updates balances/leaderboard.
9. PWA installability, offline shell behavior, and cached-current-data visibility are verified.
10. Monitoring confirms job execution success and data freshness in production.
