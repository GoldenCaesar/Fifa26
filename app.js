const STORAGE_KEYS = {
  config: "fc26_config",
  state: "fc26_state"
};

const BOOTSTRAP_CONFIG = window.FC26_BOOTSTRAP || {};

const DEFAULT_CONFIG = {
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

// FIFA World Cup 2026 - Official Groups (48 teams, 12 groups)
const WC_2026_GROUPS = {
  "A": ["USA", "Mexico", "Canada", "Jamaica"],
  "B": ["Brazil", "Argentina", "Colombia", "Ecuador"],
  "C": ["England", "France", "Germany", "Netherlands"],
  "D": ["Spain", "Portugal", "Italy", "Belgium"],
  "E": ["Japan", "South Korea", "Australia", "Iran"],
  "F": ["Morocco", "Egypt", "Nigeria", "Cameroon"],
  "G": ["Croatia", "Denmark", "Norway", "Sweden"],
  "H": ["Uruguay", "Chile", "Paraguay", "Peru"],
  "I": ["Poland", "Ukraine", "Austria", "Czech Republic"],
  "J": ["Saudi Arabia", "Qatar", "Jordan", "Iraq"],
  "K": ["Ghana", "Ivory Coast", "Senegal", "Algeria"],
  "L": ["Costa Rica", "Honduras", "Panama", "New Zealand"]
};

// Full FIFA World Cup 2026 team roster (alphabetical)
const WC_TEAMS = [
  "Albania", "Algeria", "Argentina", "Australia", "Austria",
  "Belgium", "Bolivia", "Brazil",
  "Cameroon", "Canada", "Chile", "Colombia", "Costa Rica", "Croatia", "Czech Republic",
  "Denmark", "DR Congo",
  "Ecuador", "Egypt", "England",
  "France",
  "Germany", "Ghana", "Greece",
  "Honduras", "Hungary",
  "Iran", "Italy", "Ivory Coast",
  "Jamaica", "Japan", "Jordan",
  "Mexico", "Morocco",
  "Netherlands", "New Zealand", "Nigeria", "Norway",
  "Panama", "Paraguay", "Peru", "Poland", "Portugal",
  "Romania",
  "Saudi Arabia", "Scotland", "Senegal", "Serbia", "Slovakia", "Slovenia",
  "South Africa", "South Korea", "Spain", "Sweden", "Switzerland",
  "Turkey",
  "Ukraine", "Uruguay", "USA", "Uzbekistan",
  "Venezuela"
];

let picksState = [];
let countdownInterval = null;

const state = {
  config: loadConfig(),
  data: loadState(),
  supabase: null,
  chartTicker: null,
  particles: [],
  activeView: "home",
  isAdmin: false
};

if (!state.data) {
  state.data = createInitialState();
  persistState();
}

// Initialize matches on startup
if (!state.data.matches || state.data.matches.length === 0) {
  console.log("No matches found, generating World Cup 2026 schedule");
  state.data.matches = generateWorldCup2026Schedule();
  console.log(`Generated ${state.data.matches.length} matches`);
  persistState();
} else {
  // Check if knockout matches exist, if not, regenerate all matches
  const hasKnockoutMatches = state.data.matches.some(m => 
    m.round && !m.round.includes("Group")
  );
  console.log(`Existing matches: ${state.data.matches.length}, Has knockout matches: ${hasKnockoutMatches}`);
  if (!hasKnockoutMatches) {
    console.log("No knockout matches found in existing data, regenerating schedule");
    state.data.matches = generateWorldCup2026Schedule();
    console.log(`Regenerated ${state.data.matches.length} matches`);
    persistState();
  }
}

init();

function startCountdown() {
  // First World Cup 2026 match: June 11, 2026 at 11:00 UTC
  const kickoffDate = new Date("2026-06-11T11:00:00Z");
  
  function updateCountdown() {
    const now = new Date();
    const timeDiff = kickoffDate - now;
    
    if (timeDiff <= 0) {
      document.getElementById("countdown-display").innerHTML = '<div class="countdown-live">🎉 TOURNAMENT IS LIVE! 🎉</div>';
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      return;
    }
    
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    document.getElementById("days").textContent = String(days).padStart(2, "0");
    document.getElementById("hours").textContent = String(hours).padStart(2, "0");
    document.getElementById("minutes").textContent = String(minutes).padStart(2, "0");
    document.getElementById("seconds").textContent = String(seconds).padStart(2, "0");
  }
  
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

function init() {
  startCountdown();
  wirePwa();
  wireLogin();
  wireNav();
  wireSegments();
  wireSettings();
  wireGlobalButtons();
  hydrateSettingsForm();
  setSupabaseIndicator(false, "Supabase: Disconnected");
  
  // Connect to Supabase and load users FIRST before rendering
  connectSupabase().then(() => {
    renderApp();
  }).catch(() => {
    renderApp();
  });
}

function wirePwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function wireLogin() {
  const enterBtn = document.getElementById("enter-button");
  const handleInput = document.getElementById("handle-input");
  const passwordField = document.getElementById("admin-password-field");
  const passwordInput = document.getElementById("admin-password-input");

  let awaitingAdminPassword = false;

  const execute = async () => {
    if (awaitingAdminPassword) {
      if (passwordInput.value === "1705") {
        state.isAdmin = true;
        await loginByHandle("admin");
      } else {
        setStatus("login-message", "Incorrect password.");
        passwordInput.value = "";
        passwordInput.focus();
      }
    } else {
      const handle = handleInput.value.trim();
      if (handle.toLowerCase() === "admin") {
        awaitingAdminPassword = true;
        passwordField.classList.remove("hidden");
        passwordInput.focus();
        handleInput.disabled = true;
        enterBtn.innerHTML = 'Continue <i class="material-symbols-outlined">lock</i>';
        setStatus("login-message", "Enter the admin password to continue.");
      } else {
        await loginByHandle(handle);
      }
    }
  };

  enterBtn.addEventListener("click", execute);
  handleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") execute();
  });
  passwordInput.addEventListener("keydown", (event) => {
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
    state.config.timezone = payload.get("timezone") || "UTC";
    state.config.marketVisibility = payload.get("marketVisibility") || "aggregate";
    state.config.maxActiveBetsPerMatch = Math.max(1, Number(payload.get("maxActiveBetsPerMatch") || 1));
    state.config.supabaseUrl = payload.get("supabaseUrl") || "";
    state.config.supabaseAnon = payload.get("supabaseAnon") || "";
    persistConfig();
    connectSupabase();
    setStatus("settings-status", "Settings saved.");
  });

  document.getElementById("admin-refresh-btn").addEventListener("click", async () => {
    const btn = document.getElementById("admin-refresh-btn");
    btn.disabled = true;
    setStatus("admin-refresh-status", "Refreshing...");
    await runDailyRefresh(true);
    renderApp();
    setStatus("admin-refresh-status", "Daily refresh complete.");
    btn.disabled = false;
  });
}

function hydrateSettingsForm() {
  const form = document.getElementById("settings-form");
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
    if (handle.toLowerCase() !== "admin") {
      const ok = window.confirm(`No account found for ${handle}. Create it now?`);
      if (!ok) return;
    }
    user = createNewUser(handle);
    users.push(user);
    
    console.log(`Created new user: ${handle}`);
    
    // Sync new user to Supabase immediately
    syncUserToSupabase(user).then(() => {
      console.log(`User ${handle} synced to Supabase`);
    }).catch(err => {
      console.warn("Failed to sync user to Supabase:", err);
    });
  }

  state.data.currentUser = user.id;
  state.data.lastLogin = new Date().toISOString();
  persistState();

  const logo = document.getElementById("logo-wrap");
  logo.classList.add("explode");
  
  // Stop countdown timer when leaving login screen
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  setTimeout(() => {
    document.getElementById("screen-login").classList.remove("active");
    const user = getCurrentUser();
    // Admin skips team picking entirely
    if (state.isAdmin) {
      enterApp();
    } else if (needsPicks(user)) {
      initPicksScreen(user);
    } else {
      enterApp();
    }
  }, 700);
}

function switchView(target) {
  state.activeView = target;
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  document.getElementById(`view-${target}`).classList.add("active");
  document.querySelector(`.nav-item[data-target='${target}']`).classList.add("active");
  
  // Re-render content when switching views
  if (target === "home") {
    renderHomeGraph(false);
    renderBracket();
    renderUpcomingMatches();
  } else if (target === "rankings") {
    renderRankings();
  } else if (target === "standings") {
    renderMatches();
    renderCommunity();
    renderHistory();
    renderGroups();
  } else if (target === "settings" && state.isAdmin) {
    renderAdminPanel();
  }
}

function renderAdminPanel() {
  if (!state.isAdmin) return;
  const panel = document.getElementById("admin-panel");
  panel.style.display = "block";

  const list = document.getElementById("admin-user-list");
  list.innerHTML = "";

  state.data.users.forEach((user) => {
    const isCurrentAdmin = user.id === state.data.currentUser;
    const row = document.createElement("div");
    row.className = "admin-user-row";
    row.innerHTML = `
      <div class="admin-user-info">
        <span class="admin-user-handle">${user.handle}</span>
        <span class="admin-user-meta">${user.totalScore.toLocaleString()} pts &bull; ${Math.floor(user.balance)} bal</span>
      </div>
      <button class="btn btn-danger admin-delete-btn" data-userid="${user.id}" ${isCurrentAdmin ? "disabled title='Cannot delete the currently logged-in admin'" : ""}>
        <i class="material-symbols-outlined">delete</i>
      </button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll(".admin-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.dataset.userid;
      const user = state.data.users.find((u) => u.id === userId);
      if (!user) return;
      if (!confirm(`Delete user "${user.handle}"? This cannot be undone.`)) return;
      deleteUser(userId);
    });
  });
}

function deleteUser(userId) {
  const userToDelete = state.data.users.find(u => u.id === userId);
  state.data.users = state.data.users.filter((u) => u.id !== userId);
  state.data.leaderboard = state.data.leaderboard.filter((row) => row.userId !== userId);
  state.data.bets = state.data.bets.filter((bet) => bet.userId !== userId);
  persistState();
  
  // Delete from Supabase if connected
  if (userToDelete) {
    deleteUserFromSupabase(userToDelete.handle).catch(err => {
      console.warn("Failed to delete user from Supabase:", err);
    });
  }
  
  renderAdminPanel();
  renderHomeGraph(false);
}

// ── Supabase User Sync ────────────────────────────────

async function syncUserToSupabase(user) {
  if (!state.supabase) {
    console.warn('Supabase not connected, cannot sync user');
    return;
  }
  
  try {
    // Check if user already exists
    const { data: existing } = await state.supabase
      .from('users')
      .select('handle')
      .eq('handle', user.handle)
      .maybeSingle();
    
    const userData = {
      balance: user.balance,
      total_score: user.totalScore,
      picks_locked: user.picksLocked || false,
      rankings: user.rankings || []
    };
    
    if (existing) {
      // Update existing user
      const { error } = await state.supabase
        .from('users')
        .update(userData)
        .eq('handle', user.handle);
      
      if (error) {
        console.warn('Supabase user update failed:', error);
      } else {
        console.log(`Updated user ${user.handle} in Supabase (picks: ${user.rankings?.length || 0})`);
      }
    } else {
      // Insert new user
      const { error } = await state.supabase
        .from('users')
        .insert({
          handle: user.handle,
          ...userData
        });
      
      if (error) {
        console.warn('Supabase user insert failed:', error);
      } else {
        console.log(`Inserted user ${user.handle} into Supabase`);
      }
    }
  } catch (err) {
    console.warn('Supabase sync error:', err);
  }
}

async function deleteUserFromSupabase(handle) {
  if (!state.supabase) return;
  
  try {
    const { error } = await state.supabase
      .from('users')
      .delete()
      .eq('handle', handle);
    
    if (error) console.warn('Supabase user deletion failed:', error);
  } catch (err) {
    console.warn('Supabase delete error:', err);
  }
}

async function loadUsersFromSupabase() {
  if (!state.supabase) return;
  
  try {
    const { data: dbUsers, error } = await state.supabase
      .from('users')
      .select('*');
    
    if (error) {
      console.warn('Failed to load users from Supabase:', error);
      return;
    }
    
    if (dbUsers && dbUsers.length > 0) {
      console.log(`Loading ${dbUsers.length} users from Supabase...`);
      
      // Clear baseline users if they exist
      const baselineNames = ['Alex', 'Nova', 'Kairo'];
      state.data.users = state.data.users.filter(u => !baselineNames.includes(u.handle));
      
      // Add all users from Supabase
      dbUsers.forEach(dbUser => {
        const existingUser = state.data.users.find(u => u.handle === dbUser.handle);
        if (!existingUser && dbUser.handle.toLowerCase() !== 'admin') {
          // Create user from Supabase data
          const newUser = createNewUser(dbUser.handle);
          newUser.balance = dbUser.balance || 2450;
          newUser.totalScore = dbUser.total_score || 0;
          newUser.picksLocked = dbUser.picks_locked || false;
          newUser.rankings = dbUser.rankings || [];
          state.data.users.push(newUser);
          console.log(`Loaded user ${dbUser.handle} from Supabase (picks: ${newUser.rankings.length}, locked: ${newUser.picksLocked})`);
        }
      });
      
      persistState();
      console.log(`Loaded users from Supabase. Total users: ${state.data.users.length}`);
    }
  } catch (err) {
    console.warn('Error loading users from Supabase:', err);
  }
}

// ── Team Stats Management ────────────────────────────────

function initializeTeamStats() {
  const stats = {};
  WC_TEAMS.forEach(team => {
    stats[team] = { goals: 0, wins: 0, draws: 0, losses: 0 };
  });
  return stats;
}

function updateTeamStatsFromMatch(match) {
  if (!match.result || !state.data.teamStats) return;
  
  const homeTeam = match.home;
  const awayTeam = match.away;
  const result = match.result;
  
  if (!state.data.teamStats[homeTeam]) {
    state.data.teamStats[homeTeam] = { goals: 0, wins: 0, draws: 0, losses: 0 };
  }
  if (!state.data.teamStats[awayTeam]) {
    state.data.teamStats[awayTeam] = { goals: 0, wins: 0, draws: 0, losses: 0 };
  }
  
  state.data.teamStats[homeTeam].goals += result.home;
  state.data.teamStats[awayTeam].goals += result.away;
  
  if (result.winner === homeTeam) {
    state.data.teamStats[homeTeam].wins += 1;
    state.data.teamStats[awayTeam].losses += 1;
  } else if (result.winner === awayTeam) {
    state.data.teamStats[awayTeam].wins += 1;
    state.data.teamStats[homeTeam].losses += 1;
  } else {
    state.data.teamStats[homeTeam].draws += 1;
    state.data.teamStats[awayTeam].draws += 1;
  }
}

function syncUserRankingsWithTeamStats() {
  if (!state.data.teamStats) {
    state.data.teamStats = initializeTeamStats();
  }
  
  state.data.users.forEach(user => {
    if (!user.rankings || user.rankings.length === 0) return;
    
    user.rankings.forEach(ranking => {
      const teamStats = state.data.teamStats[ranking.team];
      if (teamStats) {
        ranking.goals = teamStats.goals;
        ranking.wins = teamStats.wins;
      }
    });
    
    user.totalScore = recalcScore(user) + Math.floor(user.balance / 10);
  });
}


// ── Picks screen ─────────────────────────────────────────

function needsPicks(user) {
  if (!user) return false;
  if (user.picksLocked === true) return false;
  // Migration: existing users with rankings but no picksLocked flag treated as locked
  if (user.picksLocked === undefined && user.rankings && user.rankings.length > 0) return false;
  return true;
}

function enterApp() {
  document.getElementById("screen-app").classList.add("active");
  if (state.isAdmin) {
    document.getElementById("admin-panel").style.display = "block";
    document.getElementById("top-bar-admin-badge").style.display = "inline-flex";
  }
  
  // Display username and setup sign-out menu
  const user = getCurrentUser();
  const displayName = document.getElementById("user-display-name");
  if (user && displayName) {
    displayName.textContent = user.handle;
  }
  
  // Wire up user menu toggle
  const menuBtn = document.getElementById("user-menu-btn");
  const dropdown = document.getElementById("user-menu-dropdown");
  if (menuBtn && dropdown) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    };
    
    // Close dropdown when clicking outside
    document.addEventListener("click", () => {
      dropdown.style.display = "none";
    });
  }
  
  // Wire up sign out button
  const signoutBtn = document.getElementById("signout-btn");
  if (signoutBtn) {
    signoutBtn.onclick = () => {
      state.data.currentUser = null;
      state.isAdmin = false;
      persistState();
      // Reset to login screen
      document.getElementById("screen-app").classList.remove("active");
      document.getElementById("screen-picks").classList.remove("active");
      document.getElementById("screen-login").classList.add("active");
      
      // Reset login form completely
      const handleInput = document.getElementById("handle-input");
      const passwordInput = document.getElementById("admin-password-input");
      const passwordField = document.getElementById("admin-password-field");
      const enterBtn = document.getElementById("enter-button");
      
      handleInput.value = "";
      handleInput.disabled = false;
      passwordInput.value = "";
      passwordField.classList.add("hidden");
      enterBtn.innerHTML = 'Enter <i class="material-symbols-outlined">sports_soccer</i>';
      document.getElementById("login-message").textContent = "";
      
      // Restart countdown timer
      startCountdown();
    };
  }
  
  switchView("home");
  // Don't run daily refresh on app enter - it overwrites the World Cup schedule
  // runDailyRefresh(false).then(renderApp);
  renderApp();
  connectSupabase();
}

function initPicksScreen(user) {
  picksState = user.pendingPicks && user.pendingPicks.length > 0 ? [...user.pendingPicks] : [];

  const screen = document.getElementById("screen-picks");
  const welcome = document.getElementById("picks-welcome");
  const picker = document.getElementById("picks-picker");

  screen.classList.add("active");

  if (picksState.length > 0) {
    // Returning mid-pick — skip welcome, restore previous selections
    welcome.classList.add("hidden");
    picker.classList.remove("hidden");
    renderPicksGrid();
  } else {
    welcome.classList.remove("hidden");
    picker.classList.add("hidden");
  }

  document.getElementById("picks-welcome-continue").onclick = () => {
    welcome.classList.add("hidden");
    picker.classList.remove("hidden");
    renderPicksGrid();
  };

  document.getElementById("picks-lock-btn").onclick = () => {
    if (picksState.length !== 5) return;
    lockUserPicks();
  };
}

function renderPicksGrid() {
  const grid = document.getElementById("picks-team-grid");
  grid.innerHTML = "";

  WC_TEAMS.forEach((team) => {
    const btn = document.createElement("button");
    btn.className = "team-pick-btn";
    btn.dataset.team = team;
    btn.textContent = team;

    const rank = picksState.indexOf(team);
    if (rank !== -1) {
      btn.classList.add("picked");
      btn.setAttribute("data-rank", rank + 1);
    }

    btn.addEventListener("click", () => toggleTeamPick(team));
    grid.appendChild(btn);
  });

  updatePickSlots();
}

function toggleTeamPick(team) {
  const idx = picksState.indexOf(team);
  if (idx !== -1) {
    picksState.splice(idx, 1);
  } else if (picksState.length < 5) {
    picksState.push(team);
  }
  const user = getCurrentUser();
  if (user) {
    user.pendingPicks = [...picksState];
    persistState();
  }
  updatePickSlots();
  updateTeamGrid();
}

function updatePickSlots() {
  for (let i = 1; i <= 5; i++) {
    const slot = document.querySelector(`.pick-slot[data-rank="${i}"]`);
    if (!slot) continue;
    const label = slot.querySelector(".pick-label");
    if (picksState[i - 1]) {
      label.textContent = picksState[i - 1];
      slot.classList.add("filled");
    } else {
      label.textContent = "—";
      slot.classList.remove("filled");
    }
  }
  const lockBtn = document.getElementById("picks-lock-btn");
  if (lockBtn) lockBtn.disabled = picksState.length !== 5;
}

function updateTeamGrid() {
  document.querySelectorAll(".team-pick-btn").forEach((btn) => {
    const team = btn.dataset.team;
    const rank = picksState.indexOf(team);
    if (rank !== -1) {
      btn.classList.add("picked");
      btn.setAttribute("data-rank", rank + 1);
    } else {
      btn.classList.remove("picked");
      btn.removeAttribute("data-rank");
    }
  });
}

function lockUserPicks() {
  if (picksState.length !== 5) return;
  const user = getCurrentUser();
  if (!user) return;

  user.rankings = picksState.map((team, index) => ({
    team,
    rank: index + 1,
    rankBonus: 6 - (index + 1),
    goals: 0,
    wins: 0
  }));
  user.picksLocked = true;
  user.pendingPicks = [];
  user.totalScore = recalcScore(user) + Math.floor(user.balance / 10);
  
  // Record initial score for this user
  const todayKey = toYmd(new Date(), state.config.timezone);
  if (!state.data.scoreHistory) {
    state.data.scoreHistory = {};
  }
  if (!state.data.scoreHistory[todayKey]) {
    state.data.scoreHistory[todayKey] = {};
  }
  state.data.scoreHistory[todayKey][user.id] = user.totalScore;
  
  persistState();
  
  // Sync user picks to Supabase
  syncUserToSupabase(user).catch(err => {
    console.warn("Failed to sync picks to Supabase:", err);
  });

  document.getElementById("screen-picks").classList.remove("active");
  enterApp();
}

async function runDailyRefresh(force) {
  const now = new Date();
  const todayKey = toYmd(now, state.config.timezone);
  if (!force && state.data.cache.lastRefreshYmd === todayKey) return;

  // Don't use refreshScheduleWindow - it overwrites the World Cup 2026 schedule
  // Instead, just settle bets and update scores
  // await refreshScheduleWindow(now);
  lockTodaysMatches(todayKey);
  settleYesterdayBets(todayKey);
  recomputeLeaderboard();
  
  // Record daily scores for history tracking
  recordDailyScores(todayKey);

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
  } else {
    // Always use cached odds if available
    if (state.data.cache && state.data.cache.oddsByDay && state.data.cache.oddsByDay[newDay]) {
      rolled[newDay] = state.data.cache.oddsByDay[newDay];
    }
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
  // Also lock in the odds cache for today
  if (state.data.cache && state.data.cache.oddsByDay && state.data.cache.oddsByDay[todayYmd]) {
    state.data.cache.oddsByDay[todayYmd].forEach((match) => {
      if (match.status === "open") match.status = "locked";
    });
    persistState();
  }
}

function settleYesterdayBets(todayYmd) {
  const yesterday = shiftYmd(todayYmd, -1);
  const yesterdayMatches = state.data.matches.filter((match) => match.day === yesterday);

  yesterdayMatches.forEach((match) => {
    if (!match.result) {
      match.result = randomResult(match.home, match.away);
      match.status = "final";
      // Update team stats from match result
      updateTeamStatsFromMatch(match);
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
  // Sync all user rankings with current team stats
  syncUserRankingsWithTeamStats();
}

function recordDailyScores(dayYmd) {
  if (!state.data.scoreHistory) {
    state.data.scoreHistory = {};
  }
  
  state.data.scoreHistory[dayYmd] = {};
  
  state.data.users.forEach(user => {
    if (user.handle.toLowerCase() !== "admin") {
      state.data.scoreHistory[dayYmd][user.id] = user.totalScore;
    }
  });
  
  persistState();
}

function renderApp() {
  console.log("renderApp called, currentUser:", state.data?.currentUser);
  if (!state.data.currentUser) return;
  renderHomeGraph(false);
  renderBracket();
  renderUpcomingMatches();
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
  
  // Exclude admin from leaderboard
  const users = state.data.users.filter(u => u.picksLocked && u.handle.toLowerCase() !== "admin");
  const colors = ["#ff00ff", "#39ff14", "#ffd700", "#8fb7ff", "#ff955e"];

  ctx.clearRect(0, 0, width, height);
  
  if (users.length === 0) return;
  
  // Get score history
  const scoreHistory = state.data.scoreHistory || {};
  const days = Object.keys(scoreHistory).sort();
  
  // If no history yet, show current scores as simple bar chart
  if (days.length === 0) {
    renderSimpleBarChart(ctx, users, colors, width, height);
    return;
  }
  
  // Sort users by current score (descending) for Y-axis ordering
  const sorted = [...users].sort((a, b) => b.totalScore - a.totalScore);
  
  // Chart dimensions
  const leftMargin = 120;
  const rightMargin = 20;
  const topMargin = 20;
  const bottomMargin = 40;
  const chartWidth = width - leftMargin - rightMargin;
  const chartHeight = height - topMargin - bottomMargin;
  
  // Get max score for scaling
  const allScores = days.flatMap(day => Object.values(scoreHistory[day]));
  const maxScore = Math.max(...allScores, ...sorted.map(u => u.totalScore), 100);
  const minScore = 0;
  
  // Draw axes
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftMargin, topMargin);
  ctx.lineTo(leftMargin, height - bottomMargin);
  ctx.lineTo(width - rightMargin, height - bottomMargin);
  ctx.stroke();
  
  // Draw Y-axis labels (player names with current scores, ordered by rank)
  ctx.font = "600 11px 'Be Vietnam Pro'";
  ctx.textAlign = "right";
  const ySpacing = chartHeight / (sorted.length + 1);
  
  sorted.forEach((user, idx) => {
    const y = topMargin + (idx + 1) * ySpacing;
    const color = colors[idx % colors.length];
    const isCurrentUser = user.id === state.data.currentUser;
    
    ctx.fillStyle = isCurrentUser ? color : "#a8a0ad";
    ctx.fillText(`${user.handle}: ${user.totalScore}`, leftMargin - 10, y + 4);
    
    // Draw horizontal grid line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.moveTo(leftMargin, y);
    ctx.lineTo(width - rightMargin, y);
    ctx.stroke();
  });
  
  // Draw X-axis labels (days)
  ctx.font = "500 9px 'Be Vietnam Pro'";
  ctx.textAlign = "center";
  ctx.fillStyle = "#a8a0ad";
  const displayDays = days.slice(-14); // Show last 14 days
  const xSpacing = chartWidth / (displayDays.length - 1 || 1);
  
  displayDays.forEach((day, idx) => {
    const x = leftMargin + idx * xSpacing;
    const label = new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ctx.fillText(label, x, height - bottomMargin + 20);
    
    // Draw vertical grid line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.moveTo(x, topMargin);
    ctx.lineTo(x, height - bottomMargin);
    ctx.stroke();
  });
  
  // Draw lines for each user
  sorted.forEach((user, idx) => {
    const color = colors[idx % colors.length];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    
    ctx.beginPath();
    let firstPoint = true;
    
    displayDays.forEach((day, dayIdx) => {
      const score = scoreHistory[day] && scoreHistory[day][user.id] !== undefined 
        ? scoreHistory[day][user.id] 
        : (dayIdx === displayDays.length - 1 ? user.totalScore : null);
      
      if (score !== null) {
        const x = leftMargin + dayIdx * xSpacing;
        const scorePercent = (score - minScore) / (maxScore - minScore || 1);
        const y = height - bottomMargin - (scorePercent * chartHeight);
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
        
        // Draw point
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
    });
    
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
  
  // Update leader badge
  const leader = sorted[0];
  document.getElementById("leader-badge").textContent = leader
    ? `${leader.handle.toUpperCase()} LEADS`
    : "Leader";

  if (withBurst || state.data.cache.lastLeader !== leader?.id) {
    launchLeaderEvent(leader ? `${leader.handle} Rank Up!` : "Rank Up!");
    state.data.cache.lastLeader = leader?.id;
  }

  persistState();
}

function renderSimpleBarChart(ctx, users, colors, width, height) {
  // Fallback bar chart when no history data
  const sorted = [...users].sort((a, b) => b.totalScore - a.totalScore);
  const maxScore = Math.max(...sorted.map(u => u.totalScore), 100);
  const barWidth = (width - 60) / sorted.length;
  const padding = 15;
  
  sorted.forEach((user, index) => {
    const color = colors[index % colors.length];
    const barHeight = (user.totalScore / maxScore) * (height - 80);
    const x = padding + index * barWidth + barWidth * 0.1;
    const y = height - barHeight - 40;
    const w = barWidth * 0.8;
    
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fillRect(x, y, w, barHeight);
    
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 0;
    ctx.font = "bold 11px 'Be Vietnam Pro'";
    ctx.textAlign = "center";
    ctx.fillText(user.totalScore.toLocaleString(), x + w / 2, y - 5);
    
    ctx.font = "600 10px 'Be Vietnam Pro'";
    ctx.fillStyle = user.id === state.data.currentUser ? color : "#a8a0ad";
    ctx.save();
    ctx.translate(x + w / 2, height - 10);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(user.handle, 0, 0);
    ctx.restore();
  });
  
  const leader = sorted[0];
  document.getElementById("leader-badge").textContent = leader
    ? `${leader.handle.toUpperCase()} LEADS`
    : "Leader";
}


function renderBracket() {
  console.log("renderBracket called");
  const wrap = document.getElementById("bracket-wrap");
  if (!wrap) {
    console.error("bracket-wrap element not found!");
    return;
  }
  wrap.innerHTML = "";
  
  // Get knockout matches (after group stage)
  const allMatches = state.data.matches || [];
  console.log(`Total matches: ${allMatches.length}`);
  
  const knockoutMatches = allMatches.filter(m => 
    m.round && !m.round.includes("Group")
  );
  
  console.log(`Knockout matches: ${knockoutMatches.length}`);
  
  if (knockoutMatches.length === 0) {
    wrap.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Knockout stage matches will appear here once available.</div>';
    return;
  }
  
  // Organize by round
  const rounds = {
    r32: knockoutMatches.filter(m => m.round === "Round of 32"),
    r16: knockoutMatches.filter(m => m.round === "Round of 16"),
    qf: knockoutMatches.filter(m => m.round === "Quarterfinals"),
    sf: knockoutMatches.filter(m => m.round === "Semifinals"),
    bronze: knockoutMatches.filter(m => m.round === "Third Place"),
    final: knockoutMatches.filter(m => m.round === "Final")
  };
  
  console.log('Rounds:', {
    r32: rounds.r32.length,
    r16: rounds.r16.length,
    qf: rounds.qf.length,
    sf: rounds.sf.length,
    bronze: rounds.bronze.length,
    final: rounds.final.length
  });
  
  // Create bracket container
  const bracketContainer = document.createElement("div");
  bracketContainer.className = "bracket-container";
  
  // Round of 32
  if (rounds.r32.length > 0) {
    bracketContainer.appendChild(createRoundColumn("Round of 32", rounds.r32, "r32"));
  }
  
  // Round of 16
  if (rounds.r16.length > 0) {
    bracketContainer.appendChild(createRoundColumn("Round of 16", rounds.r16, "r16"));
  }
  
  // Quarterfinals
  if (rounds.qf.length > 0) {
    bracketContainer.appendChild(createRoundColumn("Quarter-Finals", rounds.qf, "qf"));
  }
  
  // Semifinals
  if (rounds.sf.length > 0) {
    bracketContainer.appendChild(createRoundColumn("Semi-Finals", rounds.sf, "sf"));
  }
  
  // Finals
  if (rounds.bronze.length > 0 || rounds.final.length > 0) {
    const finalsMatches = [...rounds.bronze, ...rounds.final];
    bracketContainer.appendChild(createRoundColumn("Finals", finalsMatches, "finals"));
  }
  
  wrap.appendChild(bracketContainer);
}

function renderUpcomingMatches() {
  const host = document.getElementById("home-upcoming-matches");
  if (!host) return;
  
  host.innerHTML = "";
  
  const now = new Date();
  const todayYmd = toYmd(now, state.config.timezone);
  
  // Get upcoming matches (today or future, scheduled or open)
  const upcomingMatches = state.data.matches
    .filter(m => m.day >= todayYmd && (m.status === "scheduled" || m.status === "open"))
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .slice(0, 5); // Show next 5 matches
  
  if (upcomingMatches.length === 0) {
    host.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No upcoming matches scheduled.</div>';
    return;
  }
  
  upcomingMatches.forEach(match => {
    const card = document.createElement("div");
    card.className = "match-card-mini";
    card.innerHTML = `
      <div class="match-teams">${match.home} <span style="color:var(--muted)">vs</span> ${match.away}</div>
      <div class="match-details">
        <span>${match.day}</span>
        <span style="color:var(--muted)">&bull;</span>
        <span>${match.time}</span>
        <span style="color:var(--muted)">&bull;</span>
        <span>${match.round || match.group || "Match"}</span>
      </div>
    `;
    host.appendChild(card);
  });
}

function createRoundColumn(title, matches, roundClass) {
  const column = document.createElement("div");
  column.className = `bracket-round bracket-${roundClass}`;
  
  const header = document.createElement("div");
  header.className = "bracket-round-title";
  header.textContent = title;
  column.appendChild(header);
  
  const matchesContainer = document.createElement("div");
  matchesContainer.className = "bracket-matches";
  
  matches.forEach(match => {
    const matchCard = createBracketMatch(match);
    matchesContainer.appendChild(matchCard);
  });
  
  column.appendChild(matchesContainer);
  return column;
}

function createBracketMatch(match) {
  const card = document.createElement("div");
  card.className = "bracket-match";
  
  const homeTeam = match.home || "TBD";
  const awayTeam = match.away || "TBD";
  const homeScore = match.result?.home ?? "";
  const awayScore = match.result?.away ?? "";
  const isComplete = match.status === "final";
  const winner = match.result?.winner;
  
  card.innerHTML = `
    <div class="bracket-team ${winner === homeTeam ? 'winner' : ''}">
      <span class="team-name">${homeTeam}</span>
      ${isComplete ? `<span class="team-score">${homeScore}</span>` : ''}
    </div>
    <div class="bracket-divider"></div>
    <div class="bracket-team ${winner === awayTeam ? 'winner' : ''}">
      <span class="team-name">${awayTeam}</span>
      ${isComplete ? `<span class="team-score">${awayScore}</span>` : ''}
    </div>
    ${!isComplete && match.status !== "scheduled" ? `<div class="bracket-status">${match.status.toUpperCase()}</div>` : ''}
  `;
  
  return card;
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
        
        // Determine which team is favored (lower odds = more likely to win)
        const homeFavored = match.odds.home < match.odds.away;
        const awayFavored = match.odds.away < match.odds.home;
        const homeLabel = homeFavored ? " ⭐ Favored" : (awayFavored ? " Underdog" : "");
        const awayLabel = awayFavored ? " ⭐ Favored" : (homeFavored ? " Underdog" : "");
        
        oddsRow.innerHTML = `
          <button class="odds-btn" data-pick="${match.home}" data-odds="${match.odds.home}">
            ${match.home} ${match.odds.home.toFixed(2)}x${homeLabel}
          </button>
          <button class="odds-btn" data-pick="${match.away}" data-odds="${match.odds.away}">
            ${match.away} ${match.odds.away.toFixed(2)}x${awayLabel}
          </button>
        `;
        
        const oddsExplainer = document.createElement("div");
        oddsExplainer.className = "inline-note";
        oddsExplainer.style.cssText = "font-size:11px;margin-top:4px;text-align:center";
        oddsExplainer.innerHTML = "<strong>Lower odds</strong> = team favored to win (safer bet, lower payout) &bull; <strong>Higher odds</strong> = underdog (riskier bet, higher payout)";

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
            profit.textContent = "Potential Profit: +0 points (Total Return: +0)";
            return;
          }
          const p = Math.max(value * selected.odds, value * 0.1);
          const totalReturn = value + p;
          profit.textContent = `Potential Profit: +${Math.round(p)} points (Total Return: ${Math.round(totalReturn)} if win)`;
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
        card.appendChild(oddsExplainer);
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
    return Promise.resolve();
  }

  try {
    state.supabase = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnon);
    return testSupabaseConnection();
  } catch {
    setSupabaseIndicator(false, "Supabase: Connection failed");
    setStatus("settings-status", "Supabase connection failed. Check URL/anon key.");
    return Promise.resolve();
  }
}

async function testSupabaseConnection() {
  if (!state.supabase) {
    setSupabaseIndicator(false, "Supabase: Disconnected");
    return;
  }

  try {
    const { error } = await state.supabase.from("users").select("id").limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows, which is fine
      setSupabaseIndicator(false, "Supabase: Query failed");
      setStatus("settings-status", `Supabase query failed: ${error.message}`);
      return;
    }

    setSupabaseIndicator(true, "Supabase: Connected");
    
    // Load users from Supabase and merge with local
    await loadUsersFromSupabase();
    
    // Set up realtime channel
    const channel = state.supabase.channel("fc26-live");
    channel
      .on("broadcast", { event: "event" }, (payload) => {
        if (payload?.payload?.origin === state.data.currentUser) return;
        renderApp();
      })
      .subscribe();
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
  // Check if odds for this day are already cached locally
  if (state.data.cache && state.data.cache.oddsByDay && state.data.cache.oddsByDay[dayYmd]) {
    return state.data.cache.oddsByDay[dayYmd];
  }

  let matches;
  
  // If Supabase is connected, fetch from database (server has already fetched from APIs)
  if (state.supabase) {
    try {
      const { data, error } = await state.supabase
        .from("matches")
        .select("*")
        .eq("day", dayYmd);
      
      if (!error && data && data.length > 0) {
        // Convert database format to app format
        matches = data.map(convertDbMatchToApp);
      } else {
        // Fallback to mock if no data in database
        matches = generateMockMatches(dayYmd);
      }
    } catch {
      matches = generateMockMatches(dayYmd);
    }
  } else {
    // No Supabase connection - use mock data
    matches = generateMockMatches(dayYmd);
  }

  // Cache odds for this day (avoid repeated database queries)
  if (!state.data.cache.oddsByDay) state.data.cache.oddsByDay = {};
  state.data.cache.oddsByDay[dayYmd] = matches;
  persistState();
  return matches;
}

function convertDbMatchToApp(dbMatch) {
  return {
    id: dbMatch.id,
    day: dbMatch.day,
    time: dbMatch.kickoff_time,
    home: dbMatch.home_team,
    away: dbMatch.away_team,
    odds: {
      home: Number(dbMatch.odds_home),
      away: Number(dbMatch.odds_away)
    },
    status: dbMatch.status,
    result: dbMatch.winner ? {
      winner: dbMatch.winner,
      homeScore: dbMatch.result_home,
      awayScore: dbMatch.result_away
    } : null
  };
}

function generateMockMatches(dayYmd) {
  // Use real World Cup 2026 schedule if date matches
  const realMatches = getWorldCup2026Matches(dayYmd);
  if (realMatches && realMatches.length > 0) {
    return realMatches;
  }
  
  // Fallback to random matches for testing dates outside the tournament
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

// ── World Cup 2026 Real Schedule ────────────────────────────────

function getWorldCup2026Matches(dayYmd) {
  const allMatches = generateWorldCup2026Schedule();
  return allMatches.filter(match => match.day === dayYmd);
}

function generateWorldCup2026Schedule() {
  const matches = [];
  let matchId = 0;
  
  // GROUP STAGE: June 11-26, 2026 (72 matches total)
  Object.entries(WC_2026_GROUPS).forEach(([groupLetter, teams]) => {
    // Each group plays 6 matches (round-robin)
    const groupMatches = [
      { home: teams[0], away: teams[1] },
      { home: teams[2], away: teams[3] },
      { home: teams[0], away: teams[2] },
      { home: teams[1], away: teams[3] },
      { home: teams[3], away: teams[0] },
      { home: teams[1], away: teams[2] },
    ];
    
    groupMatches.forEach((match, idx) => {
      const dayOffset = Math.floor(matchId / 8); // 8 matches per day
      const slotInDay = matchId % 8;
      const matchTime = ["11:00", "13:00", "15:00", "17:00", "19:00", "21:00", "11:00", "13:00"][slotInDay];
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
        status: "scheduled",
        result: null
      });
      
      matchId++;
    });
  });
  
  // ROUND OF 32: June 28-30, 2026 (16 matches)
  const r32Dates = ["2026-06-28", "2026-06-28", "2026-06-29", "2026-06-29", 
                    "2026-06-29", "2026-06-29", "2026-06-30", "2026-06-30",
                    "2026-06-30", "2026-06-30", "2026-06-28", "2026-06-28",
                    "2026-06-29", "2026-06-29", "2026-06-30", "2026-06-30"];
  const r32Times = ["15:00", "19:00", "15:00", "19:00", "15:00", "19:00", "15:00", "19:00",
                    "15:00", "19:00", "11:00", "13:00", "11:00", "13:00", "11:00", "13:00"];
  
  for (let i = 0; i < 16; i++) {
    matches.push({
      id: `wc2026_r32_${i}`,
      day: r32Dates[i],
      time: r32Times[i],
      home: "TBD",
      away: "TBD",
      round: "Round of 32",
      matchup: `R32-${i + 1}`,
      odds: { home: 2.0, away: 2.0 },
      status: "scheduled",
      result: null
    });
  }
  
  // ROUND OF 16: July 2-5, 2026 (8 matches)
  const r16Dates = ["2026-07-02", "2026-07-02", "2026-07-03", "2026-07-03",
                    "2026-07-04", "2026-07-04", "2026-07-05", "2026-07-05"];
  const r16Times = ["15:00", "19:00", "15:00", "19:00", "15:00", "19:00", "15:00", "19:00"];
  
  for (let i = 0; i < 8; i++) {
    matches.push({
      id: `wc2026_r16_${i}`,
      day: r16Dates[i],
      time: r16Times[i],
      home: "TBD",
      away: "TBD",
      round: "Round of 16",
      matchup: `R16-${i + 1}`,
      odds: { home: 2.0, away: 2.0 },
      status: "scheduled",
      result: null
    });
  }
  
  // QUARTERFINALS: July 8-9, 2026 (4 matches)
  matches.push(
    { id: "wc2026_qf_1", day: "2026-07-08", time: "15:00", home: "TBD", away: "TBD", round: "Quarterfinals", matchup: "QF1", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null },
    { id: "wc2026_qf_2", day: "2026-07-08", time: "19:00", home: "TBD", away: "TBD", round: "Quarterfinals", matchup: "QF2", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null },
    { id: "wc2026_qf_3", day: "2026-07-09", time: "15:00", home: "TBD", away: "TBD", round: "Quarterfinals", matchup: "QF3", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null },
    { id: "wc2026_qf_4", day: "2026-07-09", time: "19:00", home: "TBD", away: "TBD", round: "Quarterfinals", matchup: "QF4", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null }
  );
  
  // SEMIFINALS: July 12-13, 2026 (2 matches)
  matches.push(
    { id: "wc2026_sf_1", day: "2026-07-12", time: "19:00", home: "TBD", away: "TBD", round: "Semifinals", matchup: "SF1", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null },
    { id: "wc2026_sf_2", day: "2026-07-13", time: "19:00", home: "TBD", away: "TBD", round: "Semifinals", matchup: "SF2", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null }
  );
  
  // THIRD PLACE: July 17, 2026
  matches.push(
    { id: "wc2026_3rd", day: "2026-07-17", time: "15:00", home: "TBD", away: "TBD", round: "Third Place", matchup: "3rd Place", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null }
  );
  
  // FINAL: July 19, 2026
  matches.push(
    { id: "wc2026_final", day: "2026-07-19", time: "19:00", home: "TBD", away: "TBD", round: "Final", matchup: "Final", odds: { home: 2.0, away: 2.0 }, status: "scheduled", result: null }
  );
  
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
    scoreHistory: {}, // { "2026-05-20": { userId: score, ... }, ... }
    bets: [],
    matches: [],
    cache: {
      daySchedules: {},
      lastRefreshYmd: "",
      lastRefreshedAt: "",
      lastLeader: "",
      oddsByDay: {}
    },
    teamStats: initializeTeamStats()
  };
}

function createUser(handle) {
  return {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    handle,
    balance: 2450,
    totalScore: 2450,
    picksLocked: true,
    pendingPicks: [],
    rankings: [0, 1, 2, 3, 4].map((idx) => ({
      team: TEAM_POOL[idx],
      rank: idx + 1,
      rankBonus: 6 - (idx + 1),
      goals: 0,
      wins: 0
    }))
  };
}

// Used when a real user registers via the login screen
function createNewUser(handle) {
  return {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    handle,
    balance: 2450,
    totalScore: 0,
    picksLocked: false,
    pendingPicks: [],
    rankings: []
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

