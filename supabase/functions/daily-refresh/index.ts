// Supabase Edge Function: Daily Match Refresh
// Deploy this to Supabase to handle server-side odds fetching

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ODDS_API_KEY = Deno.env.get("ODDS_API_KEY") || "";
const API_FOOTBALL_KEY = Deno.env.get("API_FOOTBALL_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REFRESH_TOKEN = Deno.env.get("FC26_REFRESH_TOKEN") || ""; // Auth token for this endpoint

const TEAM_POOL = [
  "Brazil", "France", "Argentina", "Germany", "Japan", "England",
  "Spain", "Portugal", "Italy", "USA", "Mexico", "Croatia"
];

// FIFA World Cup 2026 - Official Draw Groups (48 teams, 12 groups)
const WC_2026_GROUPS = {
  "A": ["Mexico", "South Africa", "South Korea", "Czechia"],
  "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
  "D": ["USA", "Paraguay", "Australia", "Türkiye"],
  "E": ["Germany", "Curaçao", "Côte d'Ivoire", "Ecuador"],
  "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
  "G": ["Belgium", "Egypt", "Iran", "New Zealand"],
  "H": ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  "I": ["France", "Senegal", "Iraq", "Norway"],
  "J": ["Argentina", "Algeria", "Austria", "Jordan"],
  "K": ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  "L": ["England", "Croatia", "Ghana", "Panama"]
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-refresh-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function isKnockoutRoundLabel(roundLabel: string | null | undefined): boolean {
  const label = String(roundLabel || "").toLowerCase();
  if (!label) return false;
  if (label.includes("group")) return false;
  return /(round of|quarter|semi|third place|final|knockout)/.test(label);
}

function isKnockoutByDate(dayYmd: string): boolean {
  // Group stage runs through 2026-06-27 in this project schedule.
  return dayYmd >= "2026-06-28";
}

// Derive the tournament round label from match date and kickoff time.
// Mirrors the same logic in app.js so the DB stores a useful tournament_group.
function getRoundForMatchByDate(dayYmd: string, kickoffTime: string): string | null {
  if (dayYmd >= "2026-07-19") return "Final";
  if (dayYmd >= "2026-07-18") return "Third Place";
  if (dayYmd >= "2026-07-14") return "Semifinals";
  if (dayYmd >= "2026-07-09") return "Quarterfinals";
  if (dayYmd >= "2026-07-04") return "Round of 16";
  if (dayYmd >= "2026-06-29") return "Round of 32";
  if (dayYmd === "2026-06-28") {
    // Group J matchday 3 at 02:00 UTC; Round of 32 opener at 19:00 UTC
    return kickoffTime >= "19:00" ? "Round of 32" : null;
  }
  return null; // group stage
}

function parseNullableScore(raw: any): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function findTeamScoreEntry(scores: any[], teamName: string): any | null {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const exact = scores.find((s: any) => String(s?.name || "") === teamName);
  if (exact) return exact;

  const normalizedTeam = normalizeFixtureTeamName(teamName);
  const normalized = scores.find(
    (s: any) => normalizeFixtureTeamName(String(s?.name || "")) === normalizedTeam
  );
  return normalized || null;
}

serve(async (req) => {
  console.log("=== Edge Function Called ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const providedRefreshToken = req.headers.get("x-refresh-token") || "";
  if (REFRESH_TOKEN && providedRefreshToken !== REFRESH_TOKEN) {
    console.warn("Rejected daily-refresh call: invalid refresh token");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  console.log("Processing POST request...");
  console.log("Env check - ODDS_API_KEY:", ODDS_API_KEY ? "SET" : "NOT SET");
  console.log("Env check - SUPABASE_URL:", SUPABASE_URL ? "SET" : "NOT SET");
  console.log("Env check - SUPABASE_SERVICE_KEY:", SUPABASE_SERVICE_KEY ? "SET" : "NOT SET");

  try {
    console.log("Creating Supabase client...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log("Supabase client created successfully");

    const existingMatchIds = await loadExistingMatchIdsByFixture(supabase);
    
    // Fetch ALL World Cup matches from Odds API
    let allMatches = [];
    try {
      if (ODDS_API_KEY) {
        console.log("Fetching World Cup 2026 matches from Odds API...");
        allMatches = await fetchAllWorldCupMatches();
        console.log(`Fetched ${allMatches.length} matches from Odds API`);
      } else if (API_FOOTBALL_KEY) {
        console.log("Fetching from API-Football...");
        allMatches = await fetchFromApiFootballWorldCup();
        console.log(`Fetched ${allMatches.length} matches from API-Football`);
      } else {
        console.error("ERROR: No API keys configured!");
        throw new Error("No API keys configured");
      }
    } catch (err) {
      console.error("API fetch failed:", err);
      return new Response(JSON.stringify({ 
        error: "API fetch failed", 
        message: err.message,
        note: "Check API keys and API status"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (allMatches.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No matches found",
        note: "API returned 0 matches - check if World Cup data is available"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    allMatches = allMatches.map((match) => {
      const existingId = existingMatchIds.get(buildFixtureKey(match.day, match.home_team, match.away_team));
      return existingId ? { ...match, id: existingId } : match;
    });

    // Upsert in two phases: Phase 1 strips penalty columns so the upsert succeeds even
    // if the migration adding result_home_penalties / result_away_penalties hasn't been run.
    const coreRows = allMatches.map(({ result_home_penalties, result_away_penalties, ...rest }: any) => rest);
    const { error } = await supabase.from("matches").upsert(coreRows, { onConflict: "id" });
    if (error) {
      console.error("Database insert error:", error);
      return new Response(JSON.stringify({ 
        error: "Database insert failed", 
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Phase 2: persist penalty shootout scores when the migration has been applied.
    const penaltyRows = allMatches
      .filter((m: any) => m.result_home_penalties != null || m.result_away_penalties != null)
      .map((m: any) => ({
        id: m.id,
        result_home_penalties: m.result_home_penalties,
        result_away_penalties: m.result_away_penalties
      }));
    if (penaltyRows.length > 0) {
      const { error: penError } = await supabase.from("matches").upsert(penaltyRows, { onConflict: "id" });
      if (penError) {
        console.warn("Could not store penalty scores (run migration_add_penalty_scores.sql):", penError.message);
      } else {
        console.log(`Stored penalty scores for ${penaltyRows.length} match(es)`);
      }
    }

    // Update cache metadata
    await supabase.from("cache_metadata").update({
      last_refresh_ymd: new Date().toISOString().split("T")[0],
      last_refreshed_at: new Date().toISOString(),
      source: ODDS_API_KEY ? "odds_api" : "api_football",
      note: `Loaded ${allMatches.length} World Cup 2026 matches`
    }).eq("id", 1);

    return new Response(JSON.stringify({ 
      success: true, 
      matchCount: allMatches.length,
      source: ODDS_API_KEY ? "Odds API" : "API-Football"
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

async function fetchAllWorldCupMatches(): Promise<any[]> {
  // Fetch upcoming odds
  const oddsUrl = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${encodeURIComponent(
    ODDS_API_KEY
  )}&regions=us,eu&markets=h2h`;
  
  const oddsResponse = await fetch(oddsUrl);
  if (!oddsResponse.ok) {
    throw new Error(`Odds API failed with status ${oddsResponse.status}`);
  }
  
  const oddsData = await oddsResponse.json();
  console.log(`Odds API returned ${oddsData.length} upcoming matches`);

  const matchMap = new Map<string, any>();

  for (const item of oddsData) {
    const commenceDate = new Date(item.commence_time);
    const dayYmd = commenceDate.toISOString().split("T")[0];
    const hours = commenceDate.getUTCHours();
    const minutes = commenceDate.getUTCMinutes();
    const kickoffTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    
    const bookmaker = item.bookmakers?.[0];
    const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === "h2h");
    const homeOutcome = h2hMarket?.outcomes?.find((o: any) => o.name === item.home_team);
    const awayOutcome = h2hMarket?.outcomes?.find((o: any) => o.name === item.away_team);
    
    const row: any = {
      id: `wc2026_${item.id}`,
      day: dayYmd,
      kickoff_time: kickoffTime,
      home_team: item.home_team,
      away_team: item.away_team,
      odds_home: homeOutcome?.price || 2.0,
      odds_away: awayOutcome?.price || 2.0,
      status: "open",
      tournament_group: getRoundForMatchByDate(dayYmd, kickoffTime)
    };
    matchMap.set(item.id, row);
  }

  // Fetch scores for recently completed matches (daysFrom=5 ensures coverage for older games)
  try {
    const scoresUrl = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/scores/?apiKey=${encodeURIComponent(
      ODDS_API_KEY
    )}&daysFrom=5`;
    const scoresResponse = await fetch(scoresUrl);
    if (scoresResponse.ok) {
      const scoresData = await scoresResponse.json();
      console.log(`Scores API returned ${scoresData.length} matches`);
      for (const item of scoresData) {
        const isCompleted = item.completed === true;
        const commenceDate = new Date(item.commence_time);
        const dayYmd = commenceDate.toISOString().split("T")[0];
        const hours = commenceDate.getUTCHours();
        const minutes = commenceDate.getUTCMinutes();
        const kickoffTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

        const scoreEntries = Array.isArray(item.scores) ? item.scores : [];
        let homeScore = findTeamScoreEntry(scoreEntries, item.home_team);
        let awayScore = findTeamScoreEntry(scoreEntries, item.away_team);

        // Fallback for providers that return two scores but slightly mismatched names.
        if ((!homeScore || !awayScore) && scoreEntries.length === 2) {
          homeScore = homeScore || scoreEntries[0];
          awayScore = awayScore || scoreEntries[1];
        }

        const homeGoals = parseNullableScore(homeScore?.score);
        const awayGoals = parseNullableScore(awayScore?.score);

        const tournamentGroup = getRoundForMatchByDate(dayYmd, kickoffTime);
        const existing = matchMap.get(item.id) || {
          id: `wc2026_${item.id}`,
          day: dayYmd,
          kickoff_time: kickoffTime,
          home_team: item.home_team,
          away_team: item.away_team,
          odds_home: 2.0,
          odds_away: 2.0,
          tournament_group: tournamentGroup
        };
        // Always keep tournament_group up to date when we have data
        if (!existing.tournament_group && tournamentGroup) {
          existing.tournament_group = tournamentGroup;
        }

        if (isCompleted && homeGoals !== null && awayGoals !== null) {
          // Only mark final when we actually have score data.
          existing.status = "final";
          existing.result_home = homeGoals;
          existing.result_away = awayGoals;
          existing.result_home_penalties = null;
          existing.result_away_penalties = null;
          if (homeGoals > awayGoals) existing.winner = item.home_team;
          else if (awayGoals > homeGoals) existing.winner = item.away_team;
          else if (isKnockoutByDate(dayYmd)) existing.winner = null;
          else existing.winner = "draw";
        } else if (!isCompleted && (!existing.status || existing.status === "open")) {
          // Still ongoing — keep as open.
          existing.status = "open";
        }
        // If completed but scores not yet in API: leave status unchanged so we don't
        // permanently stamp "final" with null scores.

        matchMap.set(item.id, existing);
      }
    } else {
      console.warn(`Scores API returned status ${scoresResponse.status} - skipping scores`);
    }
  } catch (err) {
    console.warn("Could not fetch scores (non-fatal):", err);
  }

  // Enrich with API-Football final outcomes when available.
  // This helps resolve PK winners that may appear as tied scores in Odds API data.
  if (API_FOOTBALL_KEY) {
    try {
      const apiFootballMatches = await fetchFromApiFootballWorldCup();
      const fixtureToApiFootball = new Map<string, any>();

      for (const row of apiFootballMatches) {
        const key = buildFixtureKey(row.day, row.home_team, row.away_team);
        if (!fixtureToApiFootball.has(key)) {
          fixtureToApiFootball.set(key, row);
        }
      }

      for (const row of matchMap.values()) {
        const key = buildFixtureKey(row.day, row.home_team, row.away_team);
        const enriched = fixtureToApiFootball.get(key);
        if (!enriched) continue;

        if (row.status !== "final" && enriched.status === "final") {
          row.status = "final";
        }

        if (Number.isFinite(enriched.result_home) && Number.isFinite(enriched.result_away)) {
          row.result_home = enriched.result_home;
          row.result_away = enriched.result_away;
        }

        if (Number.isFinite(enriched.result_home_penalties) && Number.isFinite(enriched.result_away_penalties)) {
          row.result_home_penalties = enriched.result_home_penalties;
          row.result_away_penalties = enriched.result_away_penalties;
        }

        if (enriched.winner) {
          row.winner = enriched.winner;
        } else if (row.winner == null && isKnockoutByDate(row.day)) {
          row.winner = null;
        }

        if (!row.tournament_group && enriched.tournament_group) {
          row.tournament_group = enriched.tournament_group;
        }
      }
    } catch (err) {
      console.warn("Could not enrich with API-Football outcomes (non-fatal):", err);
    }
  }

  return Array.from(matchMap.values());
}

async function fetchFromApiFootballWorldCup(): Promise<any[]> {
  // API-Football World Cup 2026 league ID is 1 (FIFA World Cup)
  // Fetch all fixtures for the tournament
  const url = "https://v3.football.api-sports.io/fixtures?league=1&season=2026";
  const response = await fetch(url, {
    headers: { "x-apisports-key": API_FOOTBALL_KEY }
  });
  if (!response.ok) throw new Error("API Football failed");
  const data = await response.json();

  return (data.response || []).map((item: any, idx: number) => {
    const fixtureDate = new Date(item.fixture?.date || new Date());
    const dayYmd = fixtureDate.toISOString().split("T")[0];
    const hours = fixtureDate.getUTCHours();
    const minutes = fixtureDate.getUTCMinutes();
    const kickoffTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    
    const home = item.teams?.home?.name || "TBD";
    const away = item.teams?.away?.name || "TBD";
    
    const fixtureStatus = item.fixture?.status?.short || "";
    const isFinal = ["FT", "AET", "PEN"].includes(fixtureStatus);
    const homeGoals = item.goals?.home;
    const awayGoals = item.goals?.away;
    const roundLabel = item.league?.round || null;

    const row: any = {
      id: `wc2026_af_${item.fixture?.id || idx}`,
      day: dayYmd,
      kickoff_time: kickoffTime,
      home_team: home,
      away_team: away,
      odds_home: 2.0,
      odds_away: 2.0,
      status: isFinal ? "final" : "open",
      tournament_group: roundLabel
    };

    if (isFinal && Number.isFinite(homeGoals) && Number.isFinite(awayGoals)) {
      const homePenalty = item.score?.penalty?.home;
      const awayPenalty = item.score?.penalty?.away;
      const hasPenaltyScores = Number.isFinite(homePenalty) && Number.isFinite(awayPenalty);
      const homeWonFlag = item.teams?.home?.winner === true;
      const awayWonFlag = item.teams?.away?.winner === true;

      row.result_home = homeGoals;
      row.result_away = awayGoals;
      row.result_home_penalties = hasPenaltyScores ? Number(homePenalty) : null;
      row.result_away_penalties = hasPenaltyScores ? Number(awayPenalty) : null;

      if (homeGoals > awayGoals) row.winner = home;
      else if (awayGoals > homeGoals) row.winner = away;
      else if (hasPenaltyScores) {
        if (homePenalty > awayPenalty) row.winner = home;
        else if (awayPenalty > homePenalty) row.winner = away;
        else row.winner = isKnockoutRoundLabel(roundLabel) ? null : "draw";
      } else if (homeWonFlag) row.winner = home;
      else if (awayWonFlag) row.winner = away;
      else row.winner = isKnockoutRoundLabel(roundLabel) ? null : "draw";
    }

    return row;
  });
}

async function loadExistingMatchIdsByFixture(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const fixtureMap = new Map<string, string>();

  const { data, error } = await supabase
    .from("matches")
    .select("id, day, home_team, away_team")
    .gte("day", "2026-06-11")
    .lte("day", "2026-07-19");

  if (error) {
    console.warn("Could not load existing matches for ID preservation:", error.message);
    return fixtureMap;
  }

  for (const row of data || []) {
    const key = buildFixtureKey(String(row.day), row.home_team, row.away_team);
    if (!fixtureMap.has(key)) {
      fixtureMap.set(key, row.id);
    }
  }

  return fixtureMap;
}

function buildFixtureKey(day: string, homeTeam: string, awayTeam: string): string {
  return [day, normalizeFixtureTeamName(homeTeam), normalizeFixtureTeamName(awayTeam)].join("|");
}

function normalizeFixtureTeamName(team: string): string {
  return String(team || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function generateMockMatches(dayYmd: string): any[] {
  // Check if this date falls within World Cup 2026 (June 11 - July 19, 2026)
  const worldCupMatches = getWorldCup2026MatchesForDay(dayYmd);
  if (worldCupMatches.length > 0) {
    return worldCupMatches.map(m => ({
      id: m.id,
      day: m.day,
      kickoff_time: m.time,
      home_team: m.home,
      away_team: m.away,
      odds_home: m.odds.home,
      odds_away: m.odds.away,
      status: m.status,
      result_home: null,
      result_away: null,
      winner: null
    }));
  }
  
  // Fallback for dates outside World Cup
  const matches = [];
  for (let i = 0; i < 4; i++) {
    const home = TEAM_POOL[(i * 2 + dayYmd.charCodeAt(9)) % TEAM_POOL.length];
    const away = TEAM_POOL[(i * 2 + 3 + dayYmd.charCodeAt(8)) % TEAM_POOL.length];
    if (home === away) continue;
    matches.push({
      id: `m_${dayYmd}_${i}_${slug(home)}_${slug(away)}`,
      day: dayYmd,
      kickoff_time: `${String(14 + i * 2).padStart(2, "0")}:30`,
      home_team: home,
      away_team: away,
      odds_home: Number((Math.random() * 1.6 + 0.45).toFixed(2)),
      odds_away: Number((Math.random() * 1.6 + 0.45).toFixed(2)),
      status: "open",
      result_home: null,
      result_away: null,
      winner: null
    });
  }
  return matches;
}

function getWorldCup2026MatchesForDay(dayYmd: string): any[] {
  const allMatches = generateWorldCup2026Schedule();
  return allMatches.filter(m => m.day === dayYmd);
}

function generateWorldCup2026Schedule(): any[] {
  const matches = [];
  let matchId = 0;
  
  // GROUP STAGE: June 11-26, 2026 (72 matches total)
  Object.entries(WC_2026_GROUPS).forEach(([groupLetter, teams]) => {
    const groupMatches = [
      { home: teams[0], away: teams[1] },
      { home: teams[2], away: teams[3] },
      { home: teams[0], away: teams[2] },
      { home: teams[1], away: teams[3] },
      { home: teams[3], away: teams[0] },
      { home: teams[1], away: teams[2] },
    ];
    
    groupMatches.forEach((match, idx) => {
      const dayOffset = Math.floor(matchId / 8);
      const slotInDay = matchId % 8;
      const matchTime = ["12:00", "15:00", "18:00", "19:00", "12:00", "15:00", "18:00", "19:00"][slotInDay];
      const date = shiftYmd("2026-06-11", dayOffset);
      
      matches.push({
        id: `wc2026_gs_${groupLetter}${idx}`,
        day: date,
        time: matchTime,
        home: match.home,
        away: match.away,
        group: `Group ${groupLetter}`,
        round: "Group Stage",
        odds: {
          home: Number((1.5 + Math.random() * 1.0).toFixed(2)),
          away: Number((1.5 + Math.random() * 1.0).toFixed(2))
        },
        status: "open"
      });
      
      matchId++;
    });
  });
  
  // KNOCKOUT ROUNDS: Round of 32, R16, QF, SF, Final
  const knockoutRounds = [
    { round: "Round of 32", count: 16, startDate: "2026-06-28", days: 3 },
    { round: "Round of 16", count: 8, startDate: "2026-07-02", days: 4 },
    { round: "Quarterfinals", count: 4, startDate: "2026-07-08", days: 2 },
    { round: "Semifinals", count: 2, startDate: "2026-07-12", days: 2 },
    { round: "Third Place", count: 1, startDate: "2026-07-17", days: 1 },
    { round: "Final", count: 1, startDate: "2026-07-19", days: 1 }
  ];
  
  knockoutRounds.forEach(({ round, count, startDate, days }) => {
    const matchesPerDay = Math.ceil(count / days);
    for (let i = 0; i < count; i++) {
      const dayOffset = Math.floor(i / matchesPerDay);
      const times = ["15:00", "19:00"];
      const timeSlot = i % 2;
      
      matches.push({
        id: `wc2026_ko_${round.toLowerCase().replace(/\s/g, '_')}_${i}`,
        day: shiftYmd(startDate, dayOffset),
        time: times[timeSlot],
        home: "TBD",
        away: "TBD",
        round: round,
        odds: { home: 2.0, away: 2.0 },
        status: "scheduled"
      });
    }
  });
  
  return matches;
}

function shiftYmd(ymd: string, shift: number): string {
  const date = new Date(ymd + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().split("T")[0];
}

function slug(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-");
}
