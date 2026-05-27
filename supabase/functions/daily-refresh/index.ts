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

// FIFA World Cup 2026 - Official Groups (48 teams, 12 groups)
const WC_2026_GROUPS = {
  "A": ["Mexico", "South Africa", "South Korea", "Czechia"],
  "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
  "D": ["USA", "Paraguay", "Australia", "Türkiye"],
  "E": ["England", "Netherlands", "Tunisia", "Costa Rica"],
  "F": ["France", "Denmark", "Saudi Arabia", "Peru"],
  "G": ["Spain", "Croatia", "Iran", "Jamaica"],
  "H": ["Argentina", "Poland", "Ukraine", "Wales"],
  "I": ["Portugal", "Belgium", "Senegal", "Japan"],
  "J": ["Germany", "Italy", "Colombia", "Ecuador"],
  "K": ["Uruguay", "Norway", "Algeria", "Panama"],
  "L": ["Chile", "Ghana", "Serbia", "Honduras"]
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-refresh-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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

  console.log("Processing POST request...");
  console.log("Env check - ODDS_API_KEY:", ODDS_API_KEY ? "SET" : "NOT SET");
  console.log("Env check - SUPABASE_URL:", SUPABASE_URL ? "SET" : "NOT SET");
  console.log("Env check - SUPABASE_SERVICE_KEY:", SUPABASE_SERVICE_KEY ? "SET" : "NOT SET");

  try {
    console.log("Creating Supabase client...");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log("Supabase client created successfully");
    
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

    // Clear existing matches and insert fresh data
    await supabase.from("matches").delete().neq("id", "");
    
    // Insert all matches
    const { error } = await supabase.from("matches").insert(allMatches);
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
  const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${encodeURIComponent(
    ODDS_API_KEY
  )}&regions=us,eu&markets=h2h`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Odds API failed with status ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`Odds API returned ${data.length} matches`);

  return data.map((item: any) => {
    const commenceDate = new Date(item.commence_time);
    const dayYmd = commenceDate.toISOString().split("T")[0];
    const hours = commenceDate.getUTCHours();
    const minutes = commenceDate.getUTCMinutes();
    const kickoffTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    
    // Get best odds from first bookmaker
    const bookmaker = item.bookmakers?.[0];
    const h2hMarket = bookmaker?.markets?.find((m: any) => m.key === "h2h");
    const homeOutcome = h2hMarket?.outcomes?.find((o: any) => o.name === item.home_team);
    const awayOutcome = h2hMarket?.outcomes?.find((o: any) => o.name === item.away_team);
    
    return {
      id: `wc2026_${item.id}`,
      day: dayYmd,
      kickoff_time: kickoffTime,
      home_team: item.home_team,
      away_team: item.away_team,
      odds_home: homeOutcome?.price || 2.0,
      odds_away: awayOutcome?.price || 2.0,
      status: "open",
      result_home: null,
      result_away: null,
      winner: null
    };
  });
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
    
    return {
      id: `wc2026_af_${item.fixture?.id || idx}`,
      day: dayYmd,
      kickoff_time: kickoffTime,
      home_team: home,
      away_team: away,
      odds_home: 2.0,
      odds_away: 2.0,
      status: "open",
      result_home: null,
      result_away: null,
      winner: null
    };
  });
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
