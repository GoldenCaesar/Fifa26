const STORAGE_KEYS = {
  config: "fc26_config",
  state: "fc26_state"
};

const BOOTSTRAP_CONFIG = window.FC26_BOOTSTRAP || {};

const DEFAULT_CONFIG = {
  provider: BOOTSTRAP_CONFIG.provider || "mock",
  apiKey: BOOTSTRAP_CONFIG.apiKey || "",
  timezone: BOOTSTRAP_CONFIG.timezone || "UTC",
  marketVisibility: BOOTSTRAP_CONFIG.marketVisibility || "aggregate",
  maxActiveBetsPerMatch: BOOTSTRAP_CONFIG.maxActiveBetsPerMatch || 1,
  supabaseUrl: BOOTSTRAP_CONFIG.supabaseUrl || "",
  supabaseAnon: BOOTSTRAP_CONFIG.supabaseAnon || ""
};

const TEAM_POOL = [
  "Brazil",
  "France",
  "Argentina",
  "Germany",
  "Japan",
  "England",
  "Spain",
  "Portugal",
  "Italy",
  "USA",
  "Mexico",
  "Croatia"
];

const GROUPS = {
  "Group A": ["Brazil", "France", "Japan", "Mexico"],
  "Group B": ["Argentina", "England", "Germany", "USA"],
  "Group C": ["Spain", "Portugal", "Italy", "Croatia"]
};

const state = {
  config: loadConfig(),
  data: loadState(),
  supabase: null,
  chartTicker: null,
  particles: [],
  activeView: "home"
};

if (!state.data) {
  state.data = createInitialState();
  persistState();
}

init();

function init() {
  wirePwa();
  wireLogin();
  wireNav();
  wireSegments();
  wireSettings();
  wireGlobalButtons();
  hydrateSettingsForm();
  setSupabaseIndicator(false, "Supabase: Disconnected");
  renderApp();
}

function wirePwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function wireLogin() {
  const enterBtn = document.getElementById("enter-button");
  const handleInput = document.getElementById("handle-input");

  const execute = async () => {
    await loginByHandle(handleInput.value.trim());
  };
  enterBtn.addEventListener("click", execute);
  handleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") execute();
  });
}

function wireNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.target));
  });
}

function wireSegments() {
  document.querySelectorAll(".seg").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".seg").forEach((node) => node.classList.remove("active"));
      document.querySelectorAll(".segment").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`seg-${button.dataset.seg}`).classList.add("active");
    });
  });
}

function wireGlobalButtons() {
  document.getElementById("refresh-button").addEventListener("click", async () => {
    await runDailyRefresh(true);
    renderApp();
  });

  document.getElementById("shuffle-rankings").addEventListener("click", () => {
    if (!state.data.currentUser) return;
    const user = getCurrentUser();
    user.rankings = shuffle([...user.rankings]);
    user.rankings.forEach((entry, index) => {
      entry.rank = index + 1;
      entry.rankBonus = 6 - (index + 1);
      entry.goals += Math.floor(Math.random() * 2);
      entry.wins += Math.floor(Math.random() * 2);
    });
    user.totalScore = recalcScore(user);
    persistState();
    renderRankings();
    renderHomeGraph(true);
    playMetalThud();
    publishRealtime("rankings:update", { userId: user.id });
  });
}

function wireSettings() {
  const form = document.getElementById("settings-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = new FormData(form);
    state.config.provider = payload.get("provider") || "mock";
    state.config.apiKey = payload.get("apiKey") || "";
    state.config.timezone = payload.get("timezone") || "UTC";
    state.config.marketVisibility = payload.get("marketVisibility") || "aggregate";
    state.config.maxActiveBetsPerMatch = Math.max(1, Number(payload.get("maxActiveBetsPerMatch") || 1));
    state.config.supabaseUrl = payload.get("supabaseUrl") || "";
    state.config.supabaseAnon = payload.get("supabaseAnon") || "";
    persistConfig();
    connectSupabase();
    setStatus("settings-status", "Settings saved.");
  });
}

function hydrateSettingsForm() {
  const form = document.getElementById("settings-form");
  form.provider.value = state.config.provider;
  form.apiKey.value = state.config.apiKey;
  form.timezone.value = state.config.timezone;
  form.marketVisibility.value = state.config.marketVisibility;
  form.maxActiveBetsPerMatch.value = state.config.maxActiveBetsPerMatch;
  form.supabaseUrl.value = state.config.supabaseUrl;
  form.supabaseAnon.value = state.config.supabaseAnon;
}

async function loginByHandle(handle) {
  if (!handle) {
    setStatus("login-message", "Enter a handle first.");
    return;
  }

  const users = state.data.users;
  let user = users.find((entry) => entry.handle.toLowerCase() === handle.toLowerCase());

  if (!user) {
    const ok = window.confirm(`No account found for ${handle}. Create it now?`);
    if (!ok) return;
    user = createUser(handle);
    users.push(user);
    state.data.leaderboard.push({ userId: user.id, history: seedHistory() });
  }

  state.data.currentUser = user.id;
  state.data.lastLogin = new Date().toISOString();
  persistState();

  const logo = document.getElementById("logo-wrap");
  logo.classList.add("explode");

  setTimeout(() => {
    document.getElementById("screen-login").classList.remove("active");
    document.getElementById("screen-app").classList.add("active");
    switchView("home");
    runDailyRefresh(false).then(renderApp);
    connectSupabase();
  }, 700);
}

function switchView(target) {
  state.activeView = target;
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  document.getElementById(`view-${target}`).classList.add("active");
  document.querySelector(`.nav-item[data-target='${target}']`).classList.add("active");
}

async function runDailyRefresh(force) {
  const now = new Date();
  const todayKey = toYmd(now, state.config.timezone);
  if (!force && state.data.cache.lastRefreshYmd === todayKey) return;

  await refreshScheduleWindow(now);
  lockTodaysMatches(todayKey);
  settleYesterdayBets(todayKey);
  recomputeLeaderboard();

  state.data.cache.lastRefreshYmd = todayKey;
  state.data.cache.lastRefreshedAt = now.toISOString();
  persistState();
}

async function refreshScheduleWindow(now) {
  const tz = state.config.timezone;
  const dayKeys = nextDays(7, now, tz);
  const previous = state.data.cache.daySchedules || {};
  const rolled = {};

  dayKeys.slice(0, 6).forEach((day) => {
    if (previous[day]) rolled[day] = previous[day];
  });

  const newDay = dayKeys[6];
  if (!rolled[newDay]) {
    rolled[newDay] = await fetchMatchesForDay(newDay);
  }

  state.data.cache.daySchedules = rolled;
  state.data.matches = Object.values(rolled).flat();
}

function lockTodaysMatches(todayYmd) {
  state.data.matches.forEach((match) => {
    if (match.day === todayYmd && match.status === "open") {
      match.status = "locked";
    }
  });
}

function settleYesterdayBets(todayYmd) {
  const yesterday = shiftYmd(todayYmd, -1);
  const yesterdayMatches = state.data.matches.filter((match) => match.day === yesterday);

  yesterdayMatches.forEach((match) => {
    if (!match.result) {
      match.result = randomResult(match.home, match.away);
      match.status = "final";
    }
  });

  state.data.bets
    .filter((bet) => bet.status === "active")
    .forEach((bet) => {
      const match = state.data.matches.find((entry) => entry.id === bet.matchId);
      if (!match || !match.result) return;

      const user = state.data.users.find((entry) => entry.id === bet.userId);
      if (!user) return;

      const chosenWon = match.result.winner === bet.pick;
      if (match.result.winner === "draw") {
        bet.status = "settled";
        bet.outcome = "loss";
        bet.delta = -bet.wager;
      } else if (chosenWon) {
        const profit = Math.max(bet.wager * bet.odds, bet.wager * 0.1);
        const payout = bet.wager + profit;
        user.balance += payout;
        bet.status = "settled";
        bet.outcome = "win";
        bet.delta = payout;
      } else {
        bet.status = "settled";
        bet.outcome = "loss";
        bet.delta = -bet.wager;
      }

      user.totalScore = recalcScore(user) + Math.floor(user.balance / 10);
    });
}

function recomputeLeaderboard() {
  state.data.leaderboard.forEach((row) => {
    const user = state.data.users.find((entry) => entry.id === row.userId);
    if (!user) return;

    const last = row.history[row.history.length - 1] || 100;
    const gain = Math.max(4, Math.round((user.totalScore / 1000) * Math.random() * 20));
    row.history.push(last + gain);
    if (row.history.length > 20) row.history.shift();
  });
}

function renderApp() {
  if (!state.data.currentUser) return;
  renderHomeGraph(false);
  renderBracket();
  renderRankings();
  renderMatches();
  renderCommunity();
  renderHistory();
  renderGroups();
}

function renderHomeGraph(withBurst) {
  const canvas = document.getElementById("leaderboard-canvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const rows = state.data.leaderboard;
  const colors = ["#ff00ff", "#39ff14", "#ffd700", "#8fb7ff", "#ff955e"];

  const maxVal = Math.max(...rows.flatMap((row) => row.history), 100);
  const minVal = Math.min(...rows.flatMap((row) => row.history), 0);

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  let top = { userId: null, score: -Infinity };

  rows.forEach((row, rowIndex) => {
    const color = colors[rowIndex % colors.length];
    ctx.beginPath();
    row.history.forEach((point, index) => {
      const x = (index / Math.max(row.history.length - 1, 1)) * (width - 30) + 15;
      const y = height - ((point - minVal) / Math.max(maxVal - minVal, 1)) * (height - 30) - 15;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = row.userId === state.data.currentUser ? 4 : 2.6;
    ctx.shadowBlur = 11;
    ctx.shadowColor = color;
    ctx.stroke();

    const current = row.history[row.history.length - 1] || 0;
    if (current > top.score) {
      top = { userId: row.userId, score: current };
    }
  });

  const leader = state.data.users.find((user) => user.id === top.userId);
  document.getElementById("leader-badge").textContent = leader
    ? `${leader.handle.toUpperCase()} LEADS`
    : "Leader";

  if (withBurst || state.data.cache.lastLeader !== top.userId) {
    launchLeaderEvent(leader ? `${leader.handle} Rank Up!` : "Rank Up!");
    state.data.cache.lastLeader = top.userId;
  }

  persistState();
}

function renderBracket() {
  const wrap = document.getElementById("bracket-wrap");
  const matches = state.data.matches.slice(0, 8);
  wrap.innerHTML = "";

  matches.forEach((match) => {
    const row = document.createElement("div");
    row.className = "match-row";
    row.innerHTML = `<div><strong>${match.home}</strong> vs <strong>${match.away}</strong><br><small>${match.day} ${match.time}</small></div><div>${formatStatus(match)}</div>`;
    wrap.appendChild(row);
  });
}

function renderRankings() {
  const user = getCurrentUser();
  if (!user) return;

  document.getElementById("total-score").textContent = user.totalScore.toLocaleString();
  const host = document.getElementById("team-cards");
  host.innerHTML = "";

  user.rankings.forEach((team) => {
    const card = document.createElement("div");
    const rankClass = team.rank === 1 ? "rank1" : team.rank === 5 ? "rank5" : "";
    card.className = `team-card ${rankClass}`;
    card.innerHTML = `
      <div class="meta"><strong>${team.team}</strong><span>Rank ${team.rank} • +${team.rankBonus}</span></div>
      <div class="flow">
        <span>${team.goals} Goals</span>
        <span>x</span>
        <span>${team.wins} Wins + ${team.rankBonus}</span>
        <span>=></span>
        <strong>${team.goals * (team.wins + team.rankBonus)} pts</strong>
      </div>
    `;
    card.classList.add("settle");
    host.appendChild(card);
  });
}

function renderMatches() {
  const user = getCurrentUser();
  const host = document.getElementById("match-list");
  host.innerHTML = "";

  state.data.matches
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .forEach((match) => {
      const card = document.createElement("article");
      card.className = "bet-card";

      const liveUrl = `https://www.google.com/search?q=${encodeURIComponent(`${match.home} vs ${match.away} live score`)}`;

      card.innerHTML = `
        <div class="bet-head">
          <div>
            <div class="teams-line">${match.home} vs ${match.away}</div>
            <small>${match.day} ${match.time}</small>
          </div>
          <span>${match.status.toUpperCase()}</span>
        </div>
      `;

      if (match.status === "open") {
        const activeCount = state.data.bets.filter(
          (entry) =>
            entry.userId === user.id &&
            entry.matchId === match.id &&
            entry.status === "active"
        ).length;
        const canPlace = activeCount < state.config.maxActiveBetsPerMatch;
        const oddsRow = document.createElement("div");
        oddsRow.className = "odds-row";
        const betInputId = `wager-${match.id}`;
        oddsRow.innerHTML = `
          <button class="odds-btn" data-pick="${match.home}" data-odds="${match.odds.home}">${match.home} ${match.odds.home.toFixed(2)}x</button>
          <button class="odds-btn" data-pick="${match.away}" data-odds="${match.odds.away}">${match.away} ${match.odds.away.toFixed(2)}x</button>
        `;

        const wager = document.createElement("div");
        wager.className = "wager-row";
        wager.innerHTML = `
          <div>
            <label>Wager Points</label>
            <input id="${betInputId}" type="number" min="1" max="${Math.floor(user.balance)}" value="100">
          </div>
          <button class="btn btn-primary">Place Bet</button>
        `;

        const profit = document.createElement("div");
        profit.className = "profit-line";
        profit.textContent = "Potential Profit: +0 points";

        let selected = null;

        oddsRow.querySelectorAll(".odds-btn").forEach((button) => {
          button.addEventListener("click", () => {
            oddsRow.querySelectorAll(".odds-btn").forEach((node) => node.classList.remove("active"));
            button.classList.add("active");
            selected = {
              pick: button.dataset.pick,
              odds: Number(button.dataset.odds)
            };
            updateProfit();
          });
        });

        const input = wager.querySelector("input");
        input.addEventListener("input", updateProfit);

        function updateProfit() {
          const value = Number(input.value || 0);
          if (!selected || value <= 0) {
            profit.textContent = "Potential Profit: +0 points";
            return;
          }
          const p = Math.max(value * selected.odds, value * 0.1);
          profit.textContent = `Potential Profit: +${Math.round(p)} points`;
        }

        wager.querySelector("button").addEventListener("click", () => {
          const wagerAmount = Number(input.value || 0);
          if (!canPlace) {
            alert(`Maximum active bets reached for this match (${state.config.maxActiveBetsPerMatch}).`);
            return;
          }
          if (!selected) {
            alert("Choose a team first.");
            return;
          }
          if (wagerAmount <= 0) {
            alert("Enter a valid wager.");
            return;
          }
          if (wagerAmount > user.balance) {
            alert("You cannot wager more points than your current balance.");
            return;
          }
          placeBet(match, selected.pick, selected.odds, wagerAmount);
        });

        card.appendChild(oddsRow);
        card.appendChild(wager);
        card.appendChild(profit);
        if (!canPlace) {
          const limit = document.createElement("div");
          limit.className = "lock-note";
          limit.textContent = `Limit reached: ${state.config.maxActiveBetsPerMatch} active bet(s) on this match.`;
          card.appendChild(limit);
        }
      } else {
        const lock = document.createElement("div");
        lock.className = "lock-note";
        lock.innerHTML = `Betting locked. <a href="${liveUrl}" target="_blank" rel="noopener">Open Google Live Scores</a>`;
        card.appendChild(lock);
      }

      host.appendChild(card);
    });
}

function placeBet(match, pick, odds, wagerAmount) {
  const user = getCurrentUser();
  if (!user) return;

  const activeCount = state.data.bets.filter(
    (entry) =>
      entry.userId === user.id &&
      entry.matchId === match.id &&
      entry.status === "active"
  ).length;
  if (activeCount >= state.config.maxActiveBetsPerMatch) {
    return;
  }

  user.balance -= wagerAmount;

  state.data.bets.push({
    id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: user.id,
    matchId: match.id,
    pick,
    odds,
    wager: wagerAmount,
    status: "active",
    outcome: "pending",
    delta: 0,
    createdAt: new Date().toISOString()
  });

  user.totalScore = recalcScore(user) + Math.floor(user.balance / 10);

  persistState();
  publishRealtime("bet:placed", { userId: user.id, matchId: match.id });
  renderMatches();
  renderCommunity();
  renderHistory();
  renderRankings();
  renderHomeGraph(true);
}

function renderCommunity() {
  const host = document.getElementById("community-list");
  if (!host) return;
  host.innerHTML = "";

  const activeBets = state.data.bets.filter((entry) => entry.status === "active");
  if (!activeBets.length) {
    host.innerHTML = `<div class="history-row pending">No active community bets yet.</div>`;
    return;
  }

  const byMatch = new Map();
  activeBets.forEach((bet) => {
    if (!byMatch.has(bet.matchId)) {
      byMatch.set(bet.matchId, []);
    }
    byMatch.get(bet.matchId).push(bet);
  });

  Array.from(byMatch.entries()).forEach(([matchId, entries]) => {
    const match = state.data.matches.find((item) => item.id === matchId);
    const row = document.createElement("div");
    row.className = "history-row pending";

    if (!match) {
      row.textContent = `Unknown match: ${entries.length} active bets`;
      host.appendChild(row);
      return;
    }

    const totalStake = entries.reduce((sum, item) => sum + item.wager, 0);
    if (state.config.marketVisibility === "exact") {
      const details = entries
        .slice(0, 4)
        .map((item) => {
          const user = state.data.users.find((entry) => entry.id === item.userId);
          return `${user ? user.handle : "User"} ${item.pick} (${item.wager})`;
        })
        .join(" | ");
      row.textContent = `${match.home} vs ${match.away} -> ${entries.length} bets, ${totalStake} points staked. ${details}`;
    } else {
      row.textContent = `${match.home} vs ${match.away} -> ${entries.length} active bets, ${totalStake} points staked.`;
    }

    host.appendChild(row);
  });
}

function renderHistory() {
  const user = getCurrentUser();
  const host = document.getElementById("history-list");
  host.innerHTML = "";

  const userBets = state.data.bets
    .filter((bet) => bet.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!userBets.length) {
    host.innerHTML = `<div class="history-row pending">No bets yet.</div>`;
    return;
  }

  userBets.forEach((bet) => {
    const match = state.data.matches.find((entry) => entry.id === bet.matchId);
    const row = document.createElement("div");
    row.className = `history-row ${bet.outcome}`;
    const versus = match ? `${match.home} vs ${match.away}` : "Unknown match";

    let result = "Pending";
    if (bet.outcome === "win") result = `+${Math.round(bet.delta)} points`;
    if (bet.outcome === "loss") result = `${Math.round(bet.delta)} points`;

    row.textContent = `Bet ${bet.wager} points on ${bet.pick} in ${versus} -> Result: ${result}`;
    host.appendChild(row);
  });
}

function renderGroups() {
  const host = document.getElementById("group-list");
  host.innerHTML = "";

  Object.entries(GROUPS).forEach(([name, teams]) => {
    const card = document.createElement("article");
    card.className = "group-card";
    const rows = teams
      .map((team) => `<li>${team} <strong>${Math.floor(Math.random() * 10)}</strong></li>`)
      .join("");

    card.innerHTML = `<h4>${name}</h4><ul>${rows}</ul>`;
    host.appendChild(card);
  });
}

function connectSupabase() {
  if (!state.config.supabaseUrl || !state.config.supabaseAnon || !window.supabase) {
    setSupabaseIndicator(false, "Supabase: Missing config");
    return;
  }

  try {
    state.supabase = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnon);
    testSupabaseConnection();
    const channel = state.supabase.channel("fc26-live");
    channel
      .on("broadcast", { event: "event" }, (payload) => {
        if (payload?.payload?.origin === state.data.currentUser) return;
        renderApp();
      })
      .subscribe();
  } catch {
    setSupabaseIndicator(false, "Supabase: Connection failed");
    setStatus("settings-status", "Supabase connection failed. Check URL/anon key.");
  }
}

async function testSupabaseConnection() {
  if (!state.supabase) {
    setSupabaseIndicator(false, "Supabase: Disconnected");
    return;
  }

  try {
    const { error } = await state.supabase.from("app_settings").select("id").limit(1);
    if (error) {
      setSupabaseIndicator(false, "Supabase: Query failed");
      setStatus("settings-status", `Supabase query failed: ${error.message}`);
      return;
    }

    setSupabaseIndicator(true, "Supabase: Connected");
  } catch {
    setSupabaseIndicator(false, "Supabase: Unreachable");
  }
}

function setSupabaseIndicator(connected, label) {
  const dot = document.getElementById("supabase-dot");
  const status = document.getElementById("supabase-status");
  if (!dot || !status) return;

  dot.classList.remove("online", "offline");
  dot.classList.add(connected ? "online" : "offline");
  status.textContent = label;
}

function publishRealtime(type, payload) {
  if (state.supabase) {
    state.supabase.channel("fc26-live").send({
      type: "broadcast",
      event: "event",
      payload: { type, payload, origin: state.data.currentUser }
    });
  }
}

async function fetchMatchesForDay(dayYmd) {
  if (state.config.provider === "mock") {
    return generateMockMatches(dayYmd);
  }

  if (!state.config.apiKey) {
    return generateMockMatches(dayYmd);
  }

  try {
    if (state.config.provider === "odds-api") {
      return await fetchFromOddsApi(dayYmd);
    }
    if (state.config.provider === "api-football") {
      return await fetchFromApiFootball(dayYmd);
    }
  } catch {
    return generateMockMatches(dayYmd);
  }

  return generateMockMatches(dayYmd);
}

async function fetchFromOddsApi(dayYmd) {
  const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${encodeURIComponent(
    state.config.apiKey
  )}&regions=eu&markets=h2h`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Odds API failed");
  const data = await response.json();

  return data
    .slice(0, 6)
    .map((item, idx) => mapProviderMatch(item.home_team, item.away_team, dayYmd, idx, item.bookmakers?.[0]?.markets?.[0]?.outcomes));
}

async function fetchFromApiFootball(dayYmd) {
  const url = `https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(dayYmd)}`;
  const response = await fetch(url, {
    headers: {
      "x-apisports-key": state.config.apiKey
    }
  });
  if (!response.ok) throw new Error("API Football failed");
  const data = await response.json();

  return (data.response || []).slice(0, 6).map((item, idx) => {
    const home = item.teams?.home?.name || TEAM_POOL[(idx * 2) % TEAM_POOL.length];
    const away = item.teams?.away?.name || TEAM_POOL[(idx * 2 + 1) % TEAM_POOL.length];
    return mapProviderMatch(home, away, dayYmd, idx);
  });
}

function mapProviderMatch(home, away, dayYmd, idx, outcomes) {
  const homeOdds = outcomes?.find((x) => x.name === home)?.price || (Math.random() * 1.5 + 0.5);
  const awayOdds = outcomes?.find((x) => x.name === away)?.price || (Math.random() * 1.5 + 0.5);

  return {
    id: `m_${dayYmd}_${idx}_${slug(home)}_${slug(away)}`,
    day: dayYmd,
    time: `${String(12 + (idx % 8)).padStart(2, "0")}:00`,
    home,
    away,
    odds: {
      home: Number(homeOdds),
      away: Number(awayOdds)
    },
    status: "open",
    result: null
  };
}

function generateMockMatches(dayYmd) {
  const matches = [];
  for (let i = 0; i < 4; i += 1) {
    const home = TEAM_POOL[(i * 2 + dayYmd.charCodeAt(9)) % TEAM_POOL.length];
    const away = TEAM_POOL[(i * 2 + 3 + dayYmd.charCodeAt(8)) % TEAM_POOL.length];
    if (home === away) continue;
    matches.push({
      id: `m_${dayYmd}_${i}_${slug(home)}_${slug(away)}`,
      day: dayYmd,
      time: `${String(14 + i * 2).padStart(2, "0")}:30`,
      home,
      away,
      odds: {
        home: Number((Math.random() * 1.6 + 0.45).toFixed(2)),
        away: Number((Math.random() * 1.6 + 0.45).toFixed(2))
      },
      status: "open",
      result: null
    });
  }
  return matches;
}

function launchLeaderEvent(text) {
  const slot = document.getElementById("leader-event");
  slot.textContent = text;
  slot.style.opacity = "1";
  setTimeout(() => {
    slot.style.opacity = "0.7";
  }, 1100);
}

function playMetalThud() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.22);

    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Audio is optional.
  }
}

function drawGrid(ctx, width, height) {
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((p) => {
    const y = height * p;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  });
}

function formatStatus(match) {
  if (match.status === "open") return "Open";
  if (match.status === "locked") return "Locked";
  if (match.status === "final" && match.result) return `${match.result.home} - ${match.result.away}`;
  return match.status;
}

function getCurrentUser() {
  return state.data.users.find((user) => user.id === state.data.currentUser);
}

function createInitialState() {
  const baselineUsers = [createUser("Alex"), createUser("Nova"), createUser("Kairo")];
  baselineUsers.forEach((user, idx) => {
    user.totalScore = 2000 + idx * 180;
    user.balance = 2500 + idx * 300;
  });

  return {
    currentUser: null,
    lastLogin: null,
    users: baselineUsers,
    leaderboard: baselineUsers.map((user) => ({ userId: user.id, history: seedHistory() })),
    bets: [],
    matches: [],
    cache: {
      daySchedules: {},
      lastRefreshYmd: "",
      lastRefreshedAt: "",
      lastLeader: ""
    }
  };
}

function createUser(handle) {
  return {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    handle,
    balance: 2450,
    totalScore: 2450,
    rankings: [0, 1, 2, 3, 4].map((idx) => ({
      team: TEAM_POOL[idx],
      rank: idx + 1,
      rankBonus: 6 - (idx + 1),
      goals: 6 + Math.floor(Math.random() * 8),
      wins: 2 + Math.floor(Math.random() * 6)
    }))
  };
}

function recalcScore(user) {
  return user.rankings.reduce((sum, team) => sum + team.goals * (team.wins + team.rankBonus), 0);
}

function seedHistory() {
  const points = [];
  let current = 100 + Math.floor(Math.random() * 40);
  for (let i = 0; i < 20; i += 1) {
    current += 2 + Math.floor(Math.random() * 10);
    points.push(current);
  }
  return points;
}

function randomResult(home, away) {
  const homeScore = Math.floor(Math.random() * 4);
  const awayScore = Math.floor(Math.random() * 4);
  let winner = "draw";
  if (homeScore > awayScore) winner = home;
  if (awayScore > homeScore) winner = away;
  return {
    home: homeScore,
    away: awayScore,
    winner
  };
}

function nextDays(count, baseDate, timezone) {
  const list = [];
  let day = toYmd(baseDate, timezone);
  list.push(day);
  for (let i = 1; i < count; i += 1) {
    day = shiftYmd(day, 1);
    list.push(day);
  }
  return list;
}

function toYmd(date, timezone) {
  const locale = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return locale.format(date);
}

function shiftYmd(ymd, shift) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function setStatus(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || "{}") };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function persistConfig() {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.config));
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.state) || "null");
  } catch {
    return null;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state.data));
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
