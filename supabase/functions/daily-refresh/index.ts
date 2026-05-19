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

serve(async (req) => {
  // Verify auth token
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  if (token !== REFRESH_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Get next 7 days
    const today = new Date();
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().split("T")[0]); // YYYY-MM-DD
    }

    // Fetch or generate matches for each day
    for (const day of days) {
      // Check if we already have odds for this day
      const { data: existing } = await supabase
        .from("matches")
        .select("id")
        .eq("day", day)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`Skipping ${day} - already cached`);
        continue;
      }

      // Fetch new matches
      let matches = [];
      try {
        if (ODDS_API_KEY) {
          matches = await fetchFromOddsApi(day);
        } else if (API_FOOTBALL_KEY) {
          matches = await fetchFromApiFootball(day);
        } else {
          matches = generateMockMatches(day);
        }
      } catch (err) {
        console.error(`API fetch failed for ${day}:`, err);
        matches = generateMockMatches(day);
      }

      // Insert matches into database
      const { error } = await supabase.from("matches").insert(matches);
      if (error) {
        console.error(`Insert error for ${day}:`, error);
      } else {
        console.log(`Inserted ${matches.length} matches for ${day}`);
      }
    }

    // Lock today's matches
    const todayKey = days[0];
    await supabase
      .from("matches")
      .update({ status: "locked" })
      .eq("day", todayKey)
      .eq("status", "open");

    return new Response(JSON.stringify({ success: true, refreshed: days }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

async function fetchFromOddsApi(dayYmd: string): Promise<any[]> {
  const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${encodeURIComponent(
    ODDS_API_KEY
  )}&regions=eu&markets=h2h`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Odds API failed");
  const data = await response.json();

  return data.slice(0, 6).map((item: any, idx: number) => ({
    id: `m_${dayYmd}_${idx}_${slug(item.home_team)}_${slug(item.away_team)}`,
    day: dayYmd,
    kickoff_time: `${String(12 + (idx % 8)).padStart(2, "0")}:00`,
    home_team: item.home_team,
    away_team: item.away_team,
    odds_home: item.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((x: any) => x.name === item.home_team)?.price || 1.5,
    odds_away: item.bookmakers?.[0]?.markets?.[0]?.outcomes?.find((x: any) => x.name === item.away_team)?.price || 1.5,
    status: "open",
    result_home: null,
    result_away: null,
    winner: null
  }));
}

async function fetchFromApiFootball(dayYmd: string): Promise<any[]> {
  const url = `https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(dayYmd)}`;
  const response = await fetch(url, {
    headers: { "x-apisports-key": API_FOOTBALL_KEY }
  });
  if (!response.ok) throw new Error("API Football failed");
  const data = await response.json();

  return (data.response || []).slice(0, 6).map((item: any, idx: number) => {
    const home = item.teams?.home?.name || TEAM_POOL[(idx * 2) % TEAM_POOL.length];
    const away = item.teams?.away?.name || TEAM_POOL[(idx * 2 + 1) % TEAM_POOL.length];
    return {
      id: `m_${dayYmd}_${idx}_${slug(home)}_${slug(away)}`,
      day: dayYmd,
      kickoff_time: `${String(12 + (idx % 8)).padStart(2, "0")}:00`,
      home_team: home,
      away_team: away,
      odds_home: 1.5,
      odds_away: 1.5,
      status: "open",
      result_home: null,
      result_away: null,
      winner: null
    };
  });
}

function generateMockMatches(dayYmd: string): any[] {
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

function slug(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-");
}
