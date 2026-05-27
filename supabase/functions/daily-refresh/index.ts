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

serve(async (req) => {
  // Verify custom refresh token (using custom header to bypass Supabase JWT validation)
  const token = req.headers.get("x-refresh-token");
  
  if (token !== REFRESH_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized", received: token ? "token provided" : "no token" }), {
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
