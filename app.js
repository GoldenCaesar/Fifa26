const STORAGE_KEYS = {
  config: "fc26_config",
  state: "fc26_state"
};

const BOOTSTRAP_CONFIG = window.FC26_BOOTSTRAP || {};

const DEFAULT_CONFIG = {
  timezone: "America/Los_Angeles", // Hard-coded to PST
  marketVisibility: BOOTSTRAP_CONFIG.marketVisibility || "aggregate",
  maxActiveBetsPerMatch: 1, // Default, will be loaded from database
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

// FIFA World Cup 2026 - Official Draw Groups (48 teams, 12 groups)
// Based on official tournament draw of December 2025
let WC_2026_GROUPS = {
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

const OFFICIAL_WC_2026_GROUPS = JSON.parse(JSON.stringify(WC_2026_GROUPS));

// Full FIFA World Cup 2026 team roster (alphabetical - 48 teams)
let WC_TEAMS = [
  "Algeria", "Argentina", "Australia", "Austria", "Belgium", "Bosnia and Herzegovina",
  "Brazil", "Canada", "Cape Verde", "Colombia", "Croatia", "Curaçao", "Czechia", "Côte d'Ivoire",
  "DR Congo", "Ecuador", "Egypt", "England", "France", "Germany", "Ghana", "Haiti", "Iran",
  "Iraq", "Japan", "Jordan", "Mexico", "Morocco", "Netherlands", "New Zealand", "Norway",
  "Panama", "Paraguay", "Portugal", "Qatar", "Saudi Arabia", "Scotland", "Senegal", "South Africa",
  "South Korea", "Spain", "Sweden", "Switzerland", "Tunisia", "Türkiye", "Uruguay", "USA", "Uzbekistan"
];

// Normalize a team name for fuzzy matching across standard names and API variants
// Derive a PBKDF2 hash for a password. Returns a "<hex-salt>:<hex-hash>" string
// that is safe to store in the database. Uses a random 16-byte salt by default;
// pass an existing saltHex to re-derive for verification.
async function derivePasswordHash(rawPassword, saltHex) {
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rawPassword),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  const toHex = (bytes) =>
    Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return `${toHex(salt)}:${toHex(hashBuffer)}`;
}

// Returns true when rawPassword matches a stored "<salt>:<hash>" string.
// Uses a constant-time XOR loop to prevent timing-side-channel leaks.
async function verifyPasswordHash(rawPassword, storedHash) {
  const saltHex = storedHash.split(":")[0];
  const derived = await derivePasswordHash(rawPassword, saltHex);
  if (derived.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

function normalizeTeamName(name) {
  if (!name) return "";
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents/diacritics e.g., Curaçao -> Curacao
    .replace(/[^a-z0-9]/g, ""); // strip anything except lowercase alphanumeric
}

// Global lookup mapping keys to their canonical names
const CANONICAL_TEAMS_MAP = {
  "mexico": "Mexico",
  "southafrica": "South Africa",
  "southkorea": "South Korea", "korearepublic": "South Korea", "korea": "South Korea",
  "czechia": "Czechia", "czechrepublic": "Czechia", "czech": "Czechia",
  "canada": "Canada",
  "bosniaandherzegovina": "Bosnia and Herzegovina", "bosnia": "Bosnia and Herzegovina", "bosniaherzegovina": "Bosnia and Herzegovina",
  "qatar": "Qatar",
  "switzerland": "Switzerland",
  "brazil": "Brazil",
  "morocco": "Morocco",
  "haiti": "Haiti",
  "scotland": "Scotland",
  "usa": "USA", "unitedstates": "USA", "unitedstatesofamerica": "USA",
  "paraguay": "Paraguay",
  "australia": "Australia",
  "turkey": "Türkiye", "turkiye": "Türkiye",
  "germany": "Germany",
  "curacao": "Curaçao",
  "cotedivoire": "Côte d'Ivoire", "ivorycoast": "Côte d'Ivoire",
  "ecuador": "Ecuador",
  "netherlands": "Netherlands",
  "japan": "Japan",
  "sweden": "Sweden",
  "tunisia": "Tunisia",
  "belgium": "Belgium",
  "egypt": "Egypt",
  "iran": "Iran", "iriran": "Iran",
  "newzealand": "New Zealand",
  "spain": "Spain",
  "capeverde": "Cape Verde", "caboverde": "Cape Verde",
  "saudiarabia": "Saudi Arabia",
  "uruguay": "Uruguay",
  "france": "France",
  "senegal": "Senegal",
  "iraq": "Iraq",
  "norway": "Norway",
  "argentina": "Argentina",
  "algeria": "Algeria",
  "austria": "Austria",
  "jordan": "Jordan",
  "portugal": "Portugal",
  "drcongo": "DR Congo", "congodr": "DR Congo", "democraticrepublicofcongo": "DR Congo",
  "uzbekistan": "Uzbekistan",
  "colombia": "Colombia",
  "england": "England",
  "croatia": "Croatia",
  "ghana": "Ghana",
  "panama": "Panama"
};

// Retrieve canonical team name
function getCanonicalTeamName(teamName) {
  if (!teamName) return teamName;
  const normalized = normalizeTeamName(teamName);
  return CANONICAL_TEAMS_MAP[normalized] || teamName;
}

// Retrieve World Cup Group letter for a given team name
function getTeamGroup(teamName) {
  const canonical = getCanonicalTeamName(teamName);
  for (const [groupLetter, teams] of Object.entries(OFFICIAL_WC_2026_GROUPS)) {
    if (teams.includes(canonical)) {
      return groupLetter;
    }
  }
  return null;
}

// Retrieve World Cup Group letter for a match of home vs away team
function getMatchGroup(home, away) {
  const homeGroup = getTeamGroup(home);
  if (homeGroup) return homeGroup;
  const awayGroup = getTeamGroup(away);
  if (awayGroup) return awayGroup;
  return null;
}

// Check and canonicalize any stored match entries in state to prevent duplicates on load
// and sanitize all loaded user rankings & picks so existing accounts don't suffer mismatch bugs
function sanitizeStateMatches() {
  if (state && state.data) {
    let changed = false;
    
    // 1. Sanitize Matches
    if (state.data.matches) {
      state.data.matches.forEach(m => {
        const canonicalHome = getCanonicalTeamName(m.home);
        const canonicalAway = getCanonicalTeamName(m.away);
        if (m.home !== canonicalHome || m.away !== canonicalAway) {
          m.home = canonicalHome;
          m.away = canonicalAway;
          changed = true;
        }
      });
    }

    // 2. Sanitize User Rankings, pending picks, and Bets
    if (state.data.users) {
      state.data.users.forEach(user => {
        if (Array.isArray(user.rankings)) {
          user.rankings.forEach(r => {
            const canonicalTeam = getCanonicalTeamName(r.team);
            if (r.team !== canonicalTeam) {
              r.team = canonicalTeam;
              changed = true;
            }
          });
        }
        if (Array.isArray(user.pendingPicks)) {
          user.pendingPicks = user.pendingPicks.map(p => {
            const canonicalTeam = getCanonicalTeamName(p);
            if (p !== canonicalTeam) {
              changed = true;
            }
            return canonicalTeam;
          });
        }
      });
    }

    // 3. Sanitize Active Bets list
    if (state.data.bets) {
      state.data.bets.forEach(b => {
        if (b.pick) {
          const canonicalPick = getCanonicalTeamName(b.pick);
          if (b.pick !== canonicalPick) {
            b.pick = canonicalPick;
            changed = true;
          }
        }
      });
    }

    if (changed) {
      persistState();
    }
  }
}

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

// Clean up database stored or cached names and keep them standardized to the 48 official teams
sanitizeStateMatches();

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
  
  // Check if group teams match current WC_2026_GROUPS (detect if groups changed)
  const groupMatches = state.data.matches.filter(m => m.group);
  const hasCorrectGroups = groupMatches.length > 0 && groupMatches.some(m => 
    m.home === "Mexico" || m.home === "Czechia" || m.home === "Haiti" || m.home === "T\u00fcrkiye"
  );
  
  console.log(`Existing matches: ${state.data.matches.length}, Has knockout matches: ${hasKnockoutMatches}, Has correct groups: ${hasCorrectGroups}`);
  
  if (!hasKnockoutMatches || !hasCorrectGroups) {
    console.log("Match data outdated, regenerating schedule with new groups");
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
  const userPasswordField = document.getElementById("user-password-field");
  const userPasswordInput = document.getElementById("user-password-input");

  let awaitingAdminPassword = false;
  let awaitingUserPassword = false;

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
    } else if (awaitingUserPassword) {
      const pwd = userPasswordInput.value;
      if (!pwd) {
        setStatus("login-message", "Please enter a password.");
        userPasswordInput.focus();
        return;
      }
      if (pwd.length < 8) {
        setStatus("login-message", "Password must be at least 8 characters.");
        userPasswordInput.focus();
        return;
      }
      await loginByHandle(handleInput.value.trim(), pwd);
    } else {
      const handle = handleInput.value.trim();
      if (!handle) return;
      if (handle.toLowerCase() === "admin") {
        awaitingAdminPassword = true;
        passwordField.classList.remove("hidden");
        passwordInput.focus();
        handleInput.disabled = true;
        enterBtn.innerHTML = 'Continue <i class="material-symbols-outlined">lock</i>';
        setStatus("login-message", "Enter the admin password to continue.");
      } else {
        awaitingUserPassword = true;
        userPasswordField.classList.remove("hidden");
        userPasswordInput.focus();
        handleInput.disabled = true;
        enterBtn.innerHTML = 'Continue <i class="material-symbols-outlined">arrow_forward</i>';
        setStatus("login-message", "Enter your password, or set one if you're new.");
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
  userPasswordInput.addEventListener("keydown", (event) => {
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

  // Removed: shuffle-rankings button (demo feature)
  // Scores are now calculated only from real match results
}

function wireSettings() {
  // Admin settings form - only for admin users
  const adminForm = document.getElementById("admin-settings-form");
  if (adminForm) {
    adminForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = new FormData(adminForm);
      
      const newMaxBets = Math.max(1, Number(payload.get("maxActiveBetsPerMatch") || 1));
      const newUrl = payload.get("supabaseUrl") || "";
      const newAnon = payload.get("supabaseAnon") || "";
      
      // Update local config
      state.config.maxActiveBetsPerMatch = newMaxBets;
      state.config.supabaseUrl = newUrl;
      state.config.supabaseAnon = newAnon;
      persistConfig();
      
      // Save maxActiveBetsPerMatch to database so all users get the new limit
      if (state.supabase) {
        try {
          const { error } = await state.supabase
            .from('app_settings')
            .upsert({ 
              id: 1, 
              max_active_bets_per_match: newMaxBets,
              updated_at: new Date().toISOString()
            });
          
          if (error) {
            console.error('Failed to save settings to database:', error);
            setStatus("admin-settings-status", "Settings saved locally, but failed to sync to database.");
          } else {
            setStatus("admin-settings-status", `Settings saved! Max bets per match set to ${newMaxBets} for all users.`);
          }
        } catch (err) {
          console.error('Error saving settings:', err);
          setStatus("admin-settings-status", "Settings saved locally.");
        }
      }
      
      // Reconnect Supabase if credentials changed
      if (newUrl && newAnon) {
        connectSupabase();
      }
    });
  }

  document.getElementById("admin-refresh-btn").addEventListener("click", async () => {
    const btn = document.getElementById("admin-refresh-btn");
    const status = document.getElementById("admin-refresh-status");
    
    btn.disabled = true;
    btn.innerHTML = 'Fetching from APIs... <i class="material-symbols-outlined">hourglass_empty</i>';
    status.textContent = "Fetching real match data and settling any completed bets...";
    
    // Run full daily refresh (force=true bypasses the "already ran today" guard)
    // This fetches matches, reloads bets, settles completed ones, and recomputes scores
    await runDailyRefresh(true);
    renderApp();
    
    btn.disabled = false;
    btn.innerHTML = 'Force Fetch from APIs <i class="material-symbols-outlined">cloud_download</i>';
    status.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}. Total matches: ${state.data.matches.length}`;
    
    // Update status displays
    updateRefreshStatusDisplays();
    alert(`Refresh complete! Loaded ${state.data.matches.length} matches. Any completed bets have been settled.`);
  });
  
  // Test midnight refresh button (admin only)
  const testMidnightBtn = document.getElementById("test-midnight-refresh-btn");
  if (testMidnightBtn) {
    testMidnightBtn.addEventListener("click", async () => {
      const status = document.getElementById("admin-refresh-status");
      const btn = testMidnightBtn;
      
      btn.disabled = true;
      btn.innerHTML = '<i class="material-symbols-outlined">hourglass_empty</i> Running test...';
      status.innerHTML = '🧪 <strong>Simulating midnight refresh...</strong><br>This tests score updates, bet settlements, and match locking without fetching new API data.';
      
      console.log("=== TEST MIDNIGHT REFRESH STARTED ===");
      const now = new Date();
      const todayKey = toYmd(now, state.config.timezone);
      
      try {
        // Run the midnight refresh logic without forcing API fetch
        console.log("Testing score sync...");
        syncUserRankingsWithTeamStats();
        
        console.log("Testing match locking...");
        lockTodaysMatches(todayKey);
        
        console.log("Testing bet settlement...");
        settleYesterdayBets(todayKey);
        
        console.log("Testing leaderboard recompute...");
        recomputeLeaderboard();
        
        console.log("Recording daily scores...");
        recordDailyScores(todayKey);
        
        state.data.cache.lastRefreshYmd = todayKey;
        state.data.cache.lastRefreshedAt = now.toISOString();
        persistState();
        
        console.log("=== TEST MIDNIGHT REFRESH COMPLETED ===");
        
        status.innerHTML = `✅ <strong>Test successful!</strong><br>Scores synced, bets settled, matches locked. Last test: ${now.toLocaleTimeString()} PST`;
        
        // Update displays
        updateRefreshStatusDisplays();
        renderApp();
      } catch (err) {
        console.error("Test midnight refresh failed:", err);
        status.innerHTML = `❌ <strong>Test failed:</strong> ${err.message}`;
      }
      
      btn.disabled = false;
      btn.innerHTML = '<i class="material-symbols-outlined">science</i> Test Midnight Refresh (Simulate)';
    });
  }
  
  // User delete account button
  const deleteAccountBtn = document.getElementById("delete-account-btn");
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", () => {
      const user = getCurrentUser();
      if (!user) {
        alert("No user logged in.");
        return;
      }
      
      // Prompt user to type DELETE to confirm
      const confirmation = prompt(`⚠️ WARNING: This will permanently delete your account, team picks, and all bets.\n\nType DELETE (in capital letters) to confirm:`);
      
      if (confirmation !== "DELETE") {
        if (confirmation !== null) {
          alert("Account deletion cancelled. You must type DELETE exactly to confirm.");
        }
        return;
      }
      
      // Delete the user
      const userId = user.id;
      const userHandle = user.handle;
      
      deleteUser(userId);
      
      // Log out the user
      state.data.currentUser = null;
      state.isAdmin = false;
      persistState();
      
      // Return to login screen
      document.getElementById("screen-app").classList.remove("active");
      document.getElementById("screen-picks").classList.remove("active");
      document.getElementById("screen-login").classList.add("active");
      
      // Reset login form
      const handleInput = document.getElementById("handle-input");
      const passwordInput = document.getElementById("admin-password-input");
      const passwordField = document.getElementById("admin-password-field");
      
      if (handleInput) handleInput.value = "";
      if (passwordInput) passwordInput.value = "";
      if (passwordField) passwordField.style.display = "none";
      
      const userPasswordInput2 = document.getElementById("user-password-input");
      const userPasswordField2 = document.getElementById("user-password-field");
      if (userPasswordInput2) userPasswordInput2.value = "";
      if (userPasswordField2) userPasswordField2.classList.add("hidden");
      
      alert(`Account "${userHandle}" has been permanently deleted. You can create a new account if you wish.`);
    });
  }
  
  // Set up automatic midnight refresh check
  setupMidnightRefresh();
}

function hydrateSettingsForm() {
  // Hydrate admin settings form
  const adminForm = document.getElementById("admin-settings-form");
  if (adminForm) {
    adminForm.maxActiveBetsPerMatch.value = state.config.maxActiveBetsPerMatch;
    adminForm.supabaseUrl.value = state.config.supabaseUrl;
    adminForm.supabaseAnon.value = state.config.supabaseAnon;
  }
}

async function loginByHandle(handle, rawPassword = "") {
  if (!handle) {
    setStatus("login-message", "Enter a handle first.");
    return;
  }

  const users = state.data.users;
  let user = users.find((entry) => entry.handle.toLowerCase() === handle.toLowerCase());

  // If not found locally, check Supabase database
  if (!user && state.supabase && handle.toLowerCase() !== "admin") {
    try {
      const { data: dbUsers, error } = await state.supabase
        .from('users')
        .select('*')
        .ilike('handle', handle)
        .limit(1);
      
      if (!error && dbUsers && dbUsers.length > 0) {
        const dbUser = dbUsers[0];
        console.log(`Found existing user ${handle} in database:`, dbUser);

        // Verify password if one has been set for this account.
        if (dbUser.password_hash) {
          const ok = await verifyPasswordHash(rawPassword, dbUser.password_hash);
          if (!ok) {
            setStatus("login-message", "Incorrect password.");
            return;
          }
        }

        // Load user from database into local state
        user = createNewUser(dbUser.handle);
        user.dbId = dbUser.id; // Store database UUID
        user.balance = dbUser.balance ?? 100;
        user.totalScore = dbUser.total_score ?? 0;
        user.teamPoints = dbUser.team_points ?? 0;
        user.betPoints = dbUser.bet_points ?? 0;
        user.coinsEarnedFromTeams = dbUser.coins_earned_from_teams ?? 0;

        // Keep the hash in local state so it is preserved on subsequent syncs.
        if (dbUser.password_hash) {
          user.passwordHash = dbUser.password_hash;
        }

        // If this account has no password yet (pre-migration), set one now and
        // immediately persist it so it isn't lost if the session ends early.
        if (!dbUser.password_hash && rawPassword) {
          user.passwordHash = await derivePasswordHash(rawPassword);
          console.log(`Setting password for existing account ${handle} (first login after migration)`);
          syncUserToSupabase(user).catch(err => console.warn("Failed to save migrated password:", err));
        }
        
        // Preserve rankings from database (handle null/undefined)
        if (Array.isArray(dbUser.rankings) && dbUser.rankings.length > 0) {
          user.rankings = dbUser.rankings;
        } else {
          user.rankings = [];
        }
        
        // Smart detection: if user has points OR non-default balance OR has rankings, they must have picked teams
        const hasPlayedBefore = user.totalScore > 0 || user.balance !== 100 || user.rankings.length > 0;
        user.picksLocked = dbUser.picks_locked === true || hasPlayedBefore;
        
        // Update database if we auto-locked based on activity
        if (!dbUser.picks_locked && hasPlayedBefore) {
          console.log(`Auto-locking picks for ${handle} (has activity: score=${user.totalScore}, balance=${user.balance}, rankings=${user.rankings.length})`);
          syncUserToSupabase(user).catch(err => console.warn("Failed to update picks_locked:", err));
        }
        
        users.push(user);
        persistState();
        
        console.log(`Loaded user ${handle} from database - picks_locked: ${user.picksLocked}, rankings count: ${user.rankings.length}`);
      }
    } catch (err) {
      console.warn("Failed to check database for user:", err);
    }
  }

  if (!user) {
    if (handle.toLowerCase() !== "admin") {
      const ok = window.confirm(`No account found for "${handle}". Create it now?`);
      if (!ok) return;
    }
    user = createNewUser(handle);

    // Store the password hash for the new account.
    if (rawPassword) {
      user.passwordHash = await derivePasswordHash(rawPassword);
    }

    users.push(user);
    
    console.log(`Created new user: ${handle}`);
    
    // Sync new user to Supabase immediately and store database UUID
    syncUserToSupabase(user).then(dbId => {
      if (dbId) {
        user.dbId = dbId;
        persistState();
        console.log(`User ${handle} synced to Supabase with UUID ${dbId}`);
      }
    }).catch(err => {
      console.warn("Failed to sync user to Supabase:", err);
    });
  }

  state.data.currentUser = user.id;
  state.data.lastLogin = new Date().toISOString();
  persistState();
  
  // Load all community bets from Supabase (so Community Bets shows everyone's bets)
  await loadAllBetsFromSupabase();
  
  // Recalculate user balance from bets to fix any sync issues
  // Balance = starting coins + coins from teams - total wagered
  const totalWagered = state.data.bets
    .filter(b => b.userId === user.id)
    .reduce((sum, bet) => sum + bet.wager, 0);
  
  const correctBalance = 100 + (user.coinsEarnedFromTeams || 0) - totalWagered;
  
  if (user.balance !== correctBalance) {
    console.log(`Reconciling balance for ${user.handle}: DB says ${user.balance}, should be ${correctBalance} (earned: ${user.coinsEarnedFromTeams}, wagered: ${totalWagered})`);
    user.balance = correctBalance;
    persistState();
    // Sync corrected balance back to database
    syncUserToSupabase(user);
  }

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
    const userNeedsPicks = needsPicks(user);
    console.log(`User ${user.handle} login check - needsPicks: ${userNeedsPicks}, picksLocked: ${user.picksLocked}, rankings: ${user.rankings.length}`);
    
    // Admin skips team picking entirely
    if (state.isAdmin) {
      enterApp();
    } else if (userNeedsPicks) {
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
    renderUpcomingMatches();
    renderHomeGraph(false);
    renderHomeGroups();
    renderBracket();
  } else if (target === "rankings") {
    renderRankings();
  } else if (target === "players") {
    renderPlayers();
  } else if (target === "standings") {
    renderMatches();
    renderCommunity();
    renderHistory();
  } else if (target === "settings") {
    if (state.isAdmin) {
      renderAdminPanel();
    }
    // Update refresh status displays for all users
    updateRefreshStatusDisplays();
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
        <span class="admin-user-meta">${user.totalScore.toLocaleString()} pts &bull; ${Math.floor(user.balance)} coins</span>
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
  
  // Safely filter leaderboard and bets if they exist
  if (state.data.leaderboard) {
    state.data.leaderboard = state.data.leaderboard.filter((row) => row.userId !== userId);
  }
  if (state.data.bets) {
    state.data.bets = state.data.bets.filter((bet) => bet.userId !== userId);
  }
  
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
    return null;
  }
  
  try {
    const userData = {
      balance: user.balance ?? 100,
      total_score: user.totalScore ?? 0,
      team_points: user.teamPoints ?? 0,
      bet_points: user.betPoints ?? 0,
      coins_earned_from_teams: user.coinsEarnedFromTeams ?? 0,
      picks_locked: user.picksLocked === true,
      rankings: user.rankings || []
    };

    // Only include password_hash when we explicitly have one to avoid
    // accidentally overwriting an existing hash with null during routine syncs.
    if (user.passwordHash !== undefined) {
      userData.password_hash = user.passwordHash;
    }
    
    console.log(`Syncing user ${user.handle} to Supabase:`, userData);
    
    if (user.dbId) {
      // Update existing user by database UUID
      const { error } = await state.supabase
        .from('users')
        .update(userData)
        .eq('id', user.dbId);
      
      if (error) {
        console.error('Supabase user update failed:', error);
        console.error('Attempted to update with:', userData);
        return null;
      } else {
        console.log(`✓ Updated user ${user.handle} in Supabase (picks: ${user.rankings?.length || 0}, locked: ${userData.picks_locked})`);
        return user.dbId;
      }
    } else {
      // Insert new user and get the database UUID back
      const { data, error } = await state.supabase
        .from('users')
        .upsert({
          handle: user.handle,
          ...userData
        }, {
          onConflict: 'handle'
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('Supabase user upsert failed:', error);
        console.error('Attempted to upsert:', { handle: user.handle, ...userData });
        return null;
      } else {
        console.log(`✓ Saved user ${user.handle} to Supabase (picks: ${user.rankings?.length || 0}, locked: ${userData.picks_locked})`);
        return data.id;
      }
    }
  } catch (err) {
    console.warn('Supabase sync error:', err);
    return null;
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

// Utility to parse dynamic groups from matches and map them to official World Cup 2026 draw groups
function updateDynamicGroupsAndTeams() {
  const newGroups = {};
  const teamsSet = new Set();
  
  // Initialize with official groups structure to guarantee all 12 are available and correctly seeded
  Object.entries(OFFICIAL_WC_2026_GROUPS).forEach(([gLetter, teams]) => {
    newGroups[gLetter] = new Set(teams);
    teams.forEach(t => teamsSet.add(t));
  });
  
  state.data.matches.forEach(m => {
    // Canonicalize home and away team names dynamically on the fly to eliminate duplication!
    m.home = getCanonicalTeamName(m.home);
    m.away = getCanonicalTeamName(m.away);

    teamsSet.add(m.home);
    teamsSet.add(m.away);
    
    // Assign group dynamically if the match is part of group stage and has empty group
    if (!m.round || m.round.includes("Group")) {
      const gLetter = getMatchGroup(m.home, m.away);
      if (gLetter) {
        m.group = `Group ${gLetter}`;
        if (!newGroups[gLetter]) newGroups[gLetter] = new Set();
        newGroups[gLetter].add(m.home);
        newGroups[gLetter].add(m.away);
      }
    } else if (m.group && m.group.toLowerCase().includes("group")) {
      const matchPattern = m.group.match(/Group\s+([A-L])/i);
      const letter = matchPattern ? matchPattern[1].toUpperCase() : null;
      if (letter) {
        if (!newGroups[letter]) newGroups[letter] = new Set();
        newGroups[letter].add(m.home);
        newGroups[letter].add(m.away);
      }
    }
  });

  if (Object.keys(newGroups).length > 0) {
    const formattedGroups = {};
    Object.keys(newGroups).sort().forEach(k => {
      // Direct assignment uses unique canonical names inside each group.
      // Filter out any teams that aren't canonically part of this group (if necessary),
      // but since we canonicalized them, we can just assign the unique Set of canonical names.
      formattedGroups[k] = Array.from(newGroups[k]);
    });
    WC_2026_GROUPS = formattedGroups;
  }
  
  if (teamsSet.size > 0) {
    WC_TEAMS = Array.from(teamsSet).sort();
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
      
      // Add or update all users from Supabase
      dbUsers.forEach(dbUser => {
        if (dbUser.handle.toLowerCase() === 'admin') return;
        
        const existingUser = state.data.users.find(u => u.handle === dbUser.handle);
        if (existingUser) {
          // Update existing user with fresh DB values
          existingUser.dbId = dbUser.id;
          existingUser.balance = dbUser.balance ?? existingUser.balance;
          existingUser.totalScore = dbUser.total_score ?? existingUser.totalScore;
          existingUser.teamPoints = dbUser.team_points ?? existingUser.teamPoints;
          existingUser.betPoints = dbUser.bet_points ?? existingUser.betPoints;
          existingUser.coinsEarnedFromTeams = dbUser.coins_earned_from_teams ?? existingUser.coinsEarnedFromTeams;
          if (Array.isArray(dbUser.rankings) && dbUser.rankings.length > 0) {
            existingUser.rankings = dbUser.rankings;
          }
          const hasPlayedBefore = existingUser.totalScore > 0 || existingUser.balance !== 100 || existingUser.rankings.length > 0;
          existingUser.picksLocked = dbUser.picks_locked === true || hasPlayedBefore;
          console.log(`Updated user ${dbUser.handle} from Supabase (picks: ${existingUser.rankings.length}, locked: ${existingUser.picksLocked}, score: ${existingUser.totalScore})`);
        } else {
          // Create user from Supabase data
          const newUser = createNewUser(dbUser.handle);
          newUser.dbId = dbUser.id; // Store database UUID
          newUser.balance = dbUser.balance ?? 100;
          newUser.totalScore = dbUser.total_score ?? 0;
          newUser.teamPoints = dbUser.team_points ?? 0;
          newUser.betPoints = dbUser.bet_points ?? 0;
          newUser.coinsEarnedFromTeams = dbUser.coins_earned_from_teams ?? 0;
          
          // Preserve rankings from database
          if (Array.isArray(dbUser.rankings) && dbUser.rankings.length > 0) {
            newUser.rankings = dbUser.rankings;
          } else {
            newUser.rankings = [];
          }
          
          // Smart detection: if user has points OR non-default balance OR has rankings, they must have picked teams
          const hasPlayedBefore = newUser.totalScore > 0 || newUser.balance !== 100 || newUser.rankings.length > 0;
          newUser.picksLocked = dbUser.picks_locked === true || hasPlayedBefore;
          
          state.data.users.push(newUser);
          console.log(`Loaded user ${dbUser.handle} from Supabase (picks: ${newUser.rankings.length}, locked: ${newUser.picksLocked}, score: ${newUser.totalScore})`);
        }
      });
      
      persistState();
      console.log(`Loaded users from Supabase. Total users: ${state.data.users.length}`);
    }
  } catch (err) {
    console.warn('Error loading users from Supabase:', err);
  }
}

async function loadAllBetsFromSupabase() {
  if (!state.supabase) return;
  
  try {
    const { data: dbBets, error } = await state.supabase
      .from('bets')
      .select('*');
    
    if (error) {
      console.warn('Failed to load all bets from Supabase:', error);
      return;
    }
    
    if (!dbBets || dbBets.length === 0) {
      console.log('No bets found in Supabase');
      return;
    }
    
    console.log(`Loading ${dbBets.length} community bets from Supabase...`);
    
    // Build a map from dbId -> localUserId for quick lookup
    const dbIdToLocalUser = {};
    state.data.users.forEach(u => {
      if (u.dbId) dbIdToLocalUser[u.dbId] = u;
    });
    
    // Replace all non-current-user bets with fresh data from DB
    const currentUserId = state.data.currentUser;
    // Keep bets for the current user that have no dbId yet (just-placed, not yet persisted)
    state.data.bets = state.data.bets.filter(b => b.userId === currentUserId && !b.dbId);
    
    dbBets.forEach(dbBet => {
      const localUser = dbIdToLocalUser[dbBet.user_id];
      if (!localUser) {
        // User not in local state yet — skip; loadUsersFromSupabase should have populated them
        console.warn(`Bet ${dbBet.id} references unknown user ${dbBet.user_id}, skipping`);
        return;
      }
      
      // Don't double-add a bet we already have (matched by dbId)
      const alreadyLoaded = state.data.bets.find(b => b.dbId === dbBet.id);
      if (alreadyLoaded) return;
      
      state.data.bets.push({
        id: `bet_${dbBet.id}`,
        dbId: dbBet.id,
        userId: localUser.id,
        matchId: dbBet.match_id,
        pick: dbBet.pick,
        odds: dbBet.odds,
        wager: dbBet.wager,
        status: dbBet.status,
        outcome: dbBet.outcome,
        delta: dbBet.delta || 0,
        createdAt: dbBet.created_at,
        settledAt: dbBet.settled_at
      });
    });
    
    persistState();
    console.log(`✓ Loaded all community bets. Total in state: ${state.data.bets.length}`);
  } catch (err) {
    console.warn('Error loading all bets from Supabase:', err);
  }
}

// ── Bet Sync Functions ────────────────────────────────

async function syncBetToSupabase(bet) {
  if (!state.supabase) {
    console.warn('Supabase not connected, cannot sync bet');
    return null;
  }
  
  try {
    // If bet already has a database UUID, update it
    if (bet.dbId) {
      // Need to get the user's database UUID
      const user = state.data.users.find(u => u.id === bet.userId);
      if (!user || !user.dbId) {
        console.error('Cannot update bet: user has no database UUID');
        return null;
      }
      
      const betData = {
        user_id: user.dbId, // Use database UUID, not local ID
        match_id: bet.matchId,
        pick: bet.pick,
        odds: bet.odds,
        wager: bet.wager,
        status: bet.status,
        outcome: bet.outcome,
        delta: bet.delta || 0,
        created_at: bet.createdAt,
        settled_at: bet.settledAt || null
      };
      
      const { error } = await state.supabase
        .from('bets')
        .update(betData)
        .eq('id', bet.dbId);
      
      if (error) {
        console.error('Failed to update bet in Supabase:', error);
        return null;
      } else {
        console.log(`✓ Updated bet ${bet.dbId} in Supabase`);
        return bet.dbId;
      }
    } else {
      // New bet - let database generate UUID
      // Need to get the user's database UUID
      const user = state.data.users.find(u => u.id === bet.userId);
      if (!user || !user.dbId) {
        console.error('Cannot create bet: user has no database UUID');
        return null;
      }
      
      const betData = {
        user_id: user.dbId, // Use database UUID, not local ID
        match_id: bet.matchId,
        pick: bet.pick,
        odds: bet.odds,
        wager: bet.wager,
        status: bet.status,
        outcome: bet.outcome,
        delta: bet.delta || 0,
        created_at: bet.createdAt,
        settled_at: bet.settledAt || null
      };
      
      const { data, error } = await state.supabase
        .from('bets')
        .insert(betData)
        .select('id')
        .single();
      
      if (error) {
        console.error('Failed to insert bet to Supabase:', error);
        return null;
      } else {
        console.log(`✓ Inserted bet ${data.id} to Supabase`);
        return data.id;
      }
    }
  } catch (err) {
    console.warn('Bet sync error:', err);
    return null;
  }
}

async function deleteBetFromSupabase(dbId) {
  if (!state.supabase || !dbId) return;
  
  try {
    const { error } = await state.supabase
      .from('bets')
      .delete()
      .eq('id', dbId);
    
    if (error) {
      console.warn('Failed to delete bet from Supabase:', error);
    } else {
      console.log(`✓ Deleted bet ${dbId} from Supabase`);
    }
  } catch (err) {
    console.warn('Bet deletion error:', err);
  }
}

async function loadBetsFromSupabase(userId) {
  if (!state.supabase) {
    console.warn('Supabase not connected, cannot load bets');
    return;
  }
  
  // Find user and get their database UUID
  const user = state.data.users.find(u => u.id === userId);
  if (!user || !user.dbId) {
    console.warn('Cannot load bets: user has no database UUID');
    return;
  }
  
  try {
    const { data: dbBets, error } = await state.supabase
      .from('bets')
      .select('*')
      .eq('user_id', user.dbId); // Use database UUID
    
    if (error) {
      console.warn('Failed to load bets from Supabase:', error);
      return;
    }
    
    if (dbBets && dbBets.length > 0) {
      console.log(`Loading ${dbBets.length} bets for user ${user.handle} from Supabase...`);
      
      // Remove existing bets for this user from local state
      state.data.bets = state.data.bets.filter(b => b.userId !== userId);
      
      // Add bets from database
      dbBets.forEach(dbBet => {
        state.data.bets.push({
          id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          dbId: dbBet.id, // Store database UUID separately
          userId: userId, // Use LOCAL user ID
          matchId: dbBet.match_id,
          pick: dbBet.pick,
          odds: dbBet.odds,
          wager: dbBet.wager,
          status: dbBet.status,
          outcome: dbBet.outcome,
          delta: dbBet.delta || 0,
          createdAt: dbBet.created_at,
          settledAt: dbBet.settled_at
        });
      });
      
      persistState();
      console.log(`✓ Loaded ${dbBets.length} bets from Supabase`);
    }
  } catch (err) {
    console.warn('Error loading bets from Supabase:', err);
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
    
    // Initialize new fields if missing (for existing users)
    if (user.teamPoints === undefined) user.teamPoints = 0;
    if (user.betPoints === undefined) user.betPoints = 0;
    if (user.coinsEarnedFromTeams === undefined) user.coinsEarnedFromTeams = 0;
    
    user.rankings.forEach(ranking => {
      const teamStats = state.data.teamStats[ranking.team];
      if (teamStats) {
        ranking.goals = teamStats.goals;
        ranking.wins = teamStats.wins;
      }
    });
    
    // Calculate team points from rankings
    const newTeamPoints = recalcScore(user);
    
    // Calculate coins earned from teams (10% of team points)
    const newCoinsFromTeams = Math.floor(newTeamPoints * 0.1);
    const coinsDifference = newCoinsFromTeams - user.coinsEarnedFromTeams;
    
    // Add new coins to balance
    user.balance += coinsDifference;
    user.coinsEarnedFromTeams = newCoinsFromTeams;
    user.teamPoints = newTeamPoints;
    
    // Total score = team points + bet points
    user.totalScore = user.teamPoints + user.betPoints;
    
    // Sync updated scores to database
    if (state.supabase && user.handle !== 'admin') {
      syncUserToSupabase(user).then(dbId => {
        if (dbId && !user.dbId) {
          user.dbId = dbId;
          persistState();
        }
      }).catch(err => {
        console.warn(`Failed to sync ${user.handle} scores to Supabase:`, err);
      });
    }
  });
  
  console.log('User scores updated from real match results');
}


// ── Picks screen ─────────────────────────────────────────

function needsPicks(user) {
  if (!user) return false;
  
  // If picks are locked, they definitely don't need to pick
  if (user.picksLocked === true) {
    console.log(`User ${user.handle} has picksLocked=true, skipping picks screen`);
    return false;
  }
  
  // Migration: existing users with rankings but no picksLocked flag treated as locked
  if (user.picksLocked === undefined && user.rankings && user.rankings.length > 0) {
    console.log(`User ${user.handle} has rankings (${user.rankings.length}) but no picksLocked flag, treating as locked`);
    return false;
  }
  
  console.log(`User ${user.handle} needs picks (picksLocked: ${user.picksLocked}, rankings: ${user.rankings.length})`);
  return true;
}

function enterApp() {
  document.getElementById("screen-app").classList.add("active");
  if (state.isAdmin) {
    document.getElementById("admin-panel").style.display = "block";
    document.getElementById("admin-settings-panel").style.display = "block";
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
  
  // Wire up clear cache & refresh button
  const clearCacheBtn = document.getElementById("clear-cache-btn");
  if (clearCacheBtn) {
    clearCacheBtn.onclick = () => {
      // Clear localStorage
      localStorage.clear();
      
      // Clear service worker cache
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      
      // Unregister service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(reg => reg.unregister());
        });
      }
      
      // Force reload from server (bypass cache)
      window.location.reload(true);
    };
  }
  
  // Wire up Live Standings button
  const liveStandingsBtn = document.getElementById("live-standings-btn");
  if (liveStandingsBtn) {
    liveStandingsBtn.onclick = () => {
      window.open('https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings', '_blank');
    };
  }
  
  // Wire up How to Play button
  const howToPlayBtn = document.getElementById("how-to-play-btn");
  const howToPlayOverlay = document.getElementById("how-to-play-overlay");
  const closeOverlayBtn = document.getElementById("close-overlay-btn");
  
  if (howToPlayBtn && howToPlayOverlay) {
    // Open overlay
    howToPlayBtn.onclick = () => {
      howToPlayOverlay.style.display = "flex";
    };
    
    // Close overlay via close button
    if (closeOverlayBtn) {
      closeOverlayBtn.onclick = () => {
        howToPlayOverlay.style.display = "none";
      };
    }
    
    // Close overlay when clicking outside the content
    howToPlayOverlay.onclick = (e) => {
      if (e.target === howToPlayOverlay) {
        howToPlayOverlay.style.display = "none";
      }
    };
    
    // Close overlay with Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && howToPlayOverlay.style.display === "flex") {
        howToPlayOverlay.style.display = "none";
      }
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
      const userPasswordInput = document.getElementById("user-password-input");
      const userPasswordField = document.getElementById("user-password-field");
      const enterBtn = document.getElementById("enter-button");
      
      handleInput.value = "";
      handleInput.disabled = false;
      passwordInput.value = "";
      passwordField.classList.add("hidden");
      if (userPasswordInput) userPasswordInput.value = "";
      if (userPasswordField) userPasswordField.classList.add("hidden");
      enterBtn.innerHTML = 'Enter <i class="material-symbols-outlined">sports_soccer</i>';
      document.getElementById("login-message").textContent = "";
      
      // Restart countdown timer
      startCountdown();
    };
  }
  
  switchView("home");
  // Load matches from database and then render
  loadWorldCupMatchesFromDatabase().then(() => {
    renderApp();
  });
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
  // Initialize scoring fields
  user.teamPoints = 0;
  user.betPoints = 0;
  user.totalScore = 0;
  user.balance = 100;
  user.coinsEarnedFromTeams = 0;
  
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
  
  // Sync user picks to Supabase and store database UUID
  syncUserToSupabase(user).then(dbId => {
    if (dbId && !user.dbId) {
      user.dbId = dbId;
      persistState();
    }
  }).catch(err => {
    console.warn("Failed to sync picks to Supabase:", err);
  });

  document.getElementById("screen-picks").classList.remove("active");
  enterApp();
}

async function runDailyRefresh(force) {
  const now = new Date();
  const todayKey = toYmd(now, state.config.timezone);
  if (!force && state.data.cache.lastRefreshYmd === todayKey) {
    console.log("Daily refresh already ran today, skipping...");
    return;
  }

  console.log("🔄 Running daily refresh...");
  
  // Check if we need to fetch fresh data from API (only once per day at midnight)
  const needsApiFetch = await shouldFetchFromApi(todayKey);
  if (needsApiFetch) {
    console.log("📡 Fetching fresh match data from Odds API via Edge Function...");
    await callEdgeFunctionRefresh();
  } else {
    console.log("💾 Using cached match data from database (already up to date)");
    await loadWorldCupMatchesFromDatabase();
  }
  
  // Update user scores from real match results
  console.log("📊 Syncing user rankings with team stats...");
  syncUserRankingsWithTeamStats();
  
  console.log("🔒 Locking today's matches...");
  lockTodaysMatches(todayKey);
  
  console.log("💰 Reloading bets from database before settling...");
  await loadAllBetsFromSupabase();
  
  console.log("💰 Settling completed bets...");
  settleYesterdayBets(todayKey);
  
  console.log("🏆 Recomputing leaderboard...");
  recomputeLeaderboard();
  
  // Record daily scores for history tracking
  console.log("📝 Recording daily scores...");
  recordDailyScores(todayKey);

  state.data.cache.lastRefreshYmd = todayKey;
  state.data.cache.lastRefreshedAt = now.toISOString();
  persistState();
  
  console.log("✅ Daily refresh completed successfully");
  
  // Update status displays
  updateRefreshStatusDisplays();
}

async function shouldFetchFromApi(todayKey) {
  if (!state.supabase) return false;
  
  try {
    // Check cache_metadata table to see when data was last fetched from API
    const { data, error } = await state.supabase
      .from("cache_metadata")
      .select("last_refresh_ymd")
      .eq("id", 1)
      .single();
    
    if (error || !data) {
      console.log("No cache metadata found - need to fetch from API");
      return true;
    }
    
    // If last refresh was today, use cached data
    if (data.last_refresh_ymd === todayKey) {
      console.log(`Cache is up to date (last refreshed: ${data.last_refresh_ymd})`);
      return false;
    }
    
    console.log(`Cache is stale (last refreshed: ${data.last_refresh_ymd}, today: ${todayKey})`);
    return true;
  } catch (err) {
    console.error("Error checking cache metadata:", err);
    return false; // Don't fetch on error, use existing data
  }
}

async function loadAppSettings() {
  if (!state.supabase) {
    console.warn("Supabase not connected - using default app settings");
    return;
  }

  try {
    const { data: settings, error } = await state.supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      console.warn("Could not load app settings from database:", error.message);
      return;
    }

    if (settings && settings.max_active_bets_per_match) {
      state.config.maxActiveBetsPerMatch = settings.max_active_bets_per_match;
      persistConfig(); // Save to localStorage
      
      // Update admin form if it exists
      const adminForm = document.getElementById("admin-settings-form");
      if (adminForm && adminForm.maxActiveBetsPerMatch) {
        adminForm.maxActiveBetsPerMatch.value = settings.max_active_bets_per_match;
      }
      
      console.log(`Loaded app settings: maxActiveBetsPerMatch = ${settings.max_active_bets_per_match}`);
    }
  } catch (err) {
    console.error("Error loading app settings:", err);
  }
}

async function loadWorldCupMatchesFromDatabase() {
  if (!state.supabase) {
    console.warn("Supabase not connected - using local fallback");
    if (state.data.matches.length === 0) {
      state.data.matches = generateWorldCup2026Schedule();
    }
    return;
  }

  try {
    console.log("Fetching all World Cup 2026 matches from database...");
    
    // Fetch ALL World Cup matches from June 11 to July 19, 2026
    const { data, error } = await state.supabase
      .from("matches")
      .select("*")
      .gte("day", "2026-06-11")
      .lte("day", "2026-07-19")
      .order("day", { ascending: true })
      .order("kickoff_time", { ascending: true });

    if (error) {
      console.error("Database fetch error:", error);
      if (state.data.matches.length === 0) {
        state.data.matches = generateWorldCup2026Schedule();
      }
      return;
    }

    if (data && data.length > 0) {
      console.log(`Loaded ${data.length} matches from database`);
      state.data.matches = data.map(convertDbMatchToApp);
      updateDynamicGroupsAndTeams();
      persistState();
    } else {
      console.warn("No matches in database - using local fallback");
      if (state.data.matches.length === 0) {
        state.data.matches = generateWorldCup2026Schedule();
      }
    }
  } catch (err) {
    console.error("Failed to load matches from database:", err);
    if (state.data.matches.length === 0) {
      state.data.matches = generateWorldCup2026Schedule();
    }
  }
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

  // Only generate random results when NOT connected to Supabase (offline/dev mode).
  // When connected, real results come from the sports API via the DB — we should
  // never overwrite a missing result with a fake one and settle bets incorrectly.
  if (!state.supabase) {
    yesterdayMatches.forEach((match) => {
      if (!match.result) {
        match.result = randomResult(match.home, match.away);
        match.status = "final";
        updateTeamStatsFromMatch(match);
      }
    });
  }

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
        bet.settledAt = new Date().toISOString();
      } else if (chosenWon) {
        const profit = Math.max(bet.wager * bet.odds, bet.wager * 0.1);
        const totalReturn = bet.wager + profit;
        // Winning bets convert coins to points (not back to balance)
        user.betPoints += totalReturn;
        user.totalScore = user.teamPoints + user.betPoints;
        bet.status = "settled";
        bet.outcome = "win";
        bet.delta = totalReturn;
        bet.settledAt = new Date().toISOString();
        
        // Sync updated user to Supabase
        syncUserToSupabase(user);
      } else {
        bet.status = "settled";
        bet.outcome = "loss";
        bet.delta = -bet.wager;
        bet.settledAt = new Date().toISOString();
      }
      
      // Sync settled bet to Supabase
      syncBetToSupabase(bet);
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
  renderUpcomingMatches();
  renderHomeGraph(false);
  renderHomeGroups();
  renderBracket();
  renderRankings();
  renderMatches();
  renderCommunity();
  renderHistory();
}

function renderHomeGraph(withBurst) {
  const canvas = document.getElementById("leaderboard-canvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  
  // Exclude admin from leaderboard, show all users regardless of picks status
  const users = state.data.users.filter(u => u.handle.toLowerCase() !== "admin");
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
  
  // If no knockout matches yet, create TBD placeholder structure
  if (knockoutMatches.length === 0) {
    knockoutMatches.push(
      // Round of 16 (16 matches)
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `r16-tbd-${i}`,
        round: "Round of 16",
        home: "TBD",
        away: "TBD",
        status: "scheduled",
        day: "2026-06-29"
      })),
      // Quarterfinals (8 matches)
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `qf-tbd-${i}`,
        round: "Quarterfinals",
        home: "TBD",
        away: "TBD",
        status: "scheduled",
        day: "2026-07-05"
      })),
      // Semifinals (4 matches)
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `sf-tbd-${i}`,
        round: "Semifinals",
        home: "TBD",
        away: "TBD",
        status: "scheduled",
        day: "2026-07-09"
      })),
      // Third Place (1 match)
      {
        id: "bronze-tbd",
        round: "Third Place",
        home: "TBD",
        away: "TBD",
        status: "scheduled",
        day: "2026-07-13"
      },
      // Final (1 match)
      {
        id: "final-tbd",
        round: "Final",
        home: "TBD",
        away: "TBD",
        status: "scheduled",
        day: "2026-07-14"
      }
    );
  }
  
  // Add explanation for TBD teams
  const explanation = document.createElement("div");
  explanation.className = "inline-note";
  explanation.style.cssText = "margin-bottom: 16px; text-align: center;";
  explanation.innerHTML = "🏆 Teams marked <strong>TBD</strong> (To Be Determined) will be filled in as the group stage concludes and teams qualify for the knockout rounds.";
  wrap.appendChild(explanation);
  
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
  
  // Get upcoming matches (today or future, that are open for betting)
  const upcomingMatches = state.data.matches
    .filter(m => m.day >= todayYmd && m.status === "open")
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .slice(0, 5); // Show next 5 matches
  
  if (upcomingMatches.length === 0) {
    host.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No upcoming matches available for betting.</div>';
    return;
  }
  
  upcomingMatches.forEach(match => {
    const card = document.createElement("div");
    card.className = "match-card-mini";
    card.style.cursor = "pointer";
    card.title = "Click to search live score on Google";
    
    // Format date nicely - parse as local date, not UTC
    const [year, month, day] = match.day.split("-");
    const matchDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const dateStr = matchDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    // Convert UTC time to PST
    const pstTime = convertUtcToPst(match.time);
    
    card.innerHTML = `
      <div class="match-teams">${match.home} <span style="color:var(--muted)">vs</span> ${match.away}</div>
      <div class="match-details">
        <span>${dateStr}</span>
        <span style="color:var(--muted)">&bull;</span>
        <span>${pstTime} PST</span>
        ${match.round || match.group ? `<span style="color:var(--muted)">&bull;</span><span>${match.round || match.group}</span>` : ''}
      </div>
    `;
    
    // Open Google search for live score when clicked
    card.addEventListener("click", () => {
      // Format date for search query (e.g., "june 11 2026")
      const searchDate = matchDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      
      // Build search query: "team1 vs team2 date live score"
      const searchQuery = `${match.home} vs ${match.away} ${searchDate} live score`;
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      
      // Open in new tab
      window.open(googleUrl, '_blank');
    });
    
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
  
  // Update coin balance and points breakdown
  const coinBalanceEl = document.getElementById("rankings-coin-balance");
  const teamPointsEl = document.getElementById("rankings-team-points");
  const betPointsEl = document.getElementById("rankings-bet-points");
  
  if (coinBalanceEl) coinBalanceEl.textContent = Math.floor(user.balance).toLocaleString();
  if (teamPointsEl) teamPointsEl.textContent = (user.teamPoints || 0).toLocaleString();
  if (betPointsEl) betPointsEl.textContent = (user.betPoints || 0).toLocaleString();

  // Draw personal score-over-time graph behind the score hero
  renderPersonalScoreGraph(user);

  const host = document.getElementById("team-cards");
  host.innerHTML = "";

  const usernameEl = document.getElementById("rankings-username");
  if (usernameEl) usernameEl.textContent = user.handle || "";

  user.rankings.forEach((team) => {
    const rankClass = team.rank === 1 ? "rank1" : team.rank === 2 ? "rank2" : team.rank === 3 ? "rank3" : "";
    const card = document.createElement("div");
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

function renderPersonalScoreGraph(user) {
  const canvas = document.getElementById("rankings-score-canvas");
  if (!canvas) return;

  // Size canvas to its rendered dimensions
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width || 400;
  canvas.height = rect.height || 140;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const scoreHistory = state.data.scoreHistory || {};
  const days = Object.keys(scoreHistory).sort();

  // Build the user's personal score series, filling gaps with last known value
  let lastScore = 0;
  const series = days.map(day => {
    if (scoreHistory[day][user.id] !== undefined) {
      lastScore = scoreHistory[day][user.id];
    }
    return lastScore;
  });

  // Always append today's current score as the final point
  series.push(user.totalScore);

  if (series.length < 2) {
    // Not enough history — draw a flat baseline
    series.unshift(0);
  }

  const maxScore = Math.max(...series, 1);
  const pad = { top: 10, bottom: 10, left: 10, right: 10 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const xOf = i => pad.left + (i / (series.length - 1)) * chartW;
  const yOf = v => pad.top + chartH - (v / maxScore) * chartH;

  // Filled gradient area
  const grad = ctx.createLinearGradient(0, pad.top, 0, height);
  grad.addColorStop(0, "rgba(255, 0, 255, 0.5)");
  grad.addColorStop(1, "rgba(255, 0, 255, 0)");

  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(series[0]));
  series.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)); });
  ctx.lineTo(xOf(series.length - 1), height);
  ctx.lineTo(xOf(0), height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line on top
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(series[0]));
  series.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)); });
  ctx.strokeStyle = "rgba(255, 0, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(255, 0, 255, 0.8)";
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function renderPlayers() {
  const host = document.getElementById("players-list");
  if (!host) return;
  
  host.innerHTML = "";

  // Get all users sorted by totalScore descending
  const sortedUsers = [...state.data.users].sort((a, b) => b.totalScore - a.totalScore);

  if (sortedUsers.length === 0) {
    host.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No players yet.</div>';
    return;
  }

  sortedUsers.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = "player-card";
    
    // Calculate player's team total points
    const teamPoints = player.rankings.reduce((sum, team) => sum + (team.goals * (team.wins + team.rankBonus)), 0);
    
    // Determine rank badge color
    let rankBadgeClass = "";
    if (index === 0) rankBadgeClass = "rank-gold";
    else if (index === 1) rankBadgeClass = "rank-silver";
    else if (index === 2) rankBadgeClass = "rank-bronze";
    
    card.innerHTML = `
      <div class="player-header">
        <div class="player-rank-badge ${rankBadgeClass}">#${index + 1}</div>
        <div class="player-info">
          <h4>${player.handle}</h4>
          <div class="player-stats">
            <span><strong>${player.totalScore.toLocaleString()}</strong> Total Points</span>
            <span style="color:var(--muted)">&bull;</span>
            <span>${teamPoints.toLocaleString()} from Teams</span>
            <span style="color:var(--muted)">&bull;</span>
            <span>${Math.floor(player.balance).toLocaleString()} Coins</span>
          </div>
        </div>
      </div>
      <div class="player-teams">
        <div class="player-teams-header">Team Picks:</div>
        <div class="player-teams-grid">
          ${player.rankings.map(team => `
            <div class="player-team-chip">
              <span class="team-name">${team.team}</span>
              <span class="team-score">${team.goals * (team.wins + team.rankBonus)} pts</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    host.appendChild(card);
  });
}

function renderMatches() {
  const user = getCurrentUser();
  const host = document.getElementById("match-list");
  host.innerHTML = "";
  
  // Update coin balance and score displays
  const coinBalanceEl = document.getElementById("betting-coin-balance");
  const totalScoreEl = document.getElementById("betting-total-score");
  const teamPointsEl = document.getElementById("betting-team-points");
  const betPointsEl = document.getElementById("betting-bet-points");
  const activeCountEl = document.getElementById("betting-active-count");
  
  if (coinBalanceEl) coinBalanceEl.textContent = Math.floor(user.balance).toLocaleString();
  if (totalScoreEl) totalScoreEl.textContent = user.totalScore.toLocaleString();
  if (teamPointsEl) teamPointsEl.textContent = (user.teamPoints || 0).toLocaleString();
  if (betPointsEl) betPointsEl.textContent = (user.betPoints || 0).toLocaleString();
  
  // Count active bets for this user
  const activeBetCount = state.data.bets.filter(b => b.userId === user.id && b.status === "active").length;
  if (activeCountEl) activeCountEl.textContent = activeBetCount;

  const now = new Date();
  const todayYmd = toYmd(now, state.config.timezone);
  
  // Get next 5 upcoming matches (same as home page)
  const upcomingMatches = state.data.matches
    .filter(m => m.day >= todayYmd && m.status === "open")
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .slice(0, 5); // Show next 5 matches
  
  if (upcomingMatches.length === 0) {
    host.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No upcoming matches available for betting.</div>';
    return;
  }

  upcomingMatches.forEach((match) => {
      const card = document.createElement("article");
      card.className = "bet-card";

      const liveUrl = `https://www.google.com/search?q=${encodeURIComponent(`${match.home} vs ${match.away} live score`)}`;
      
      // Format date nicely - parse as local date, not UTC
      const [year, month, day] = match.day.split("-");
      const matchDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const dateStr = matchDate.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
      const groupOrRound = match.group || match.round || "";

      card.innerHTML = `
        <div class="bet-head">
          <div>
            <div class="teams-line">${match.home} vs ${match.away}</div>
            <small>${dateStr} ${match.time} ${groupOrRound ? `• ${groupOrRound}` : ''}</small>
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
        
        // Find existing active bet on this match
        const existingBet = state.data.bets.find(
          (entry) =>
            entry.userId === user.id &&
            entry.matchId === match.id &&
            entry.status === "active"
        );
        
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
            <label>Wager Coins</label>
            <input id="${betInputId}" type="number" min="1" max="${Math.floor(user.balance)}" value="${existingBet ? existingBet.wager : 10}" autocomplete="off" ${!canPlace ? 'disabled' : ''}>
          </div>
          <button type="button" class="btn btn-primary" ${!canPlace ? 'disabled' : ''}>Place Bet</button>
        `;

        const profit = document.createElement("div");
        profit.className = "profit-line";
        profit.textContent = "Potential Profit: +0 points";

        let selected = existingBet ? { pick: existingBet.pick, odds: existingBet.odds } : null;

        oddsRow.querySelectorAll(".odds-btn").forEach((button) => {
          // Pre-select the button if user has existing bet
          if (existingBet && button.dataset.pick === existingBet.pick) {
            button.classList.add("active");
          }
          
          // Disable buttons if already bet
          if (!canPlace) {
            button.disabled = true;
            button.style.opacity = "0.6";
            button.style.cursor = "not-allowed";
          }
          
          button.addEventListener("click", () => {
            if (!canPlace) return; // Don't allow changing bet
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
            profit.textContent = "Wager coins to earn points";
            return;
          }
          const p = Math.max(value * selected.odds, value * 0.1);
          const totalReturn = value + p;
          profit.textContent = `Win: +${Math.round(totalReturn)} points to your score (${value} coins × ${selected.odds.toFixed(2)} odds)`;
        }
        
        // Initialize profit display if there's an existing bet
        if (existingBet) {
          updateProfit();
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
            alert("You cannot wager more coins than your current balance.");
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

  // Wagered coins go to the admin's balance (house takes the stake)
  const adminUser = state.data.users.find(u => u.handle.toLowerCase() === 'admin');
  if (adminUser) {
    adminUser.balance += wagerAmount;
    syncUserToSupabase(adminUser);
  }

  const newBet = {
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
  };
  
  state.data.bets.push(newBet);

  // Total score doesn't change when placing bet, only when it settles
  // (No recalculation needed here)

  persistState();
  syncUserToSupabase(user); // Sync updated balance
  
  // Sync bet to database and store the returned UUID
  syncBetToSupabase(newBet).then(dbId => {
    if (dbId) {
      newBet.dbId = dbId;
      persistState();
    }
  });
  
  publishRealtime("bet:placed", { userId: user.id, matchId: match.id });
  renderMatches();
  renderCommunity();
  renderHistory();
  renderRankings();
  renderHomeGraph(true);
}

function deleteBet(betId) {
  const user = getCurrentUser();
  if (!user) return;

  const betIndex = state.data.bets.findIndex(b => b.id === betId && b.userId === user.id);
  if (betIndex === -1) return;

  const bet = state.data.bets[betIndex];
  
  // Only allow deleting active bets
  if (bet.status !== "active") {
    alert("Only active bets can be cancelled.");
    return;
  }

  // Refund the wager to user's balance
  user.balance += bet.wager;

  // Remove the bet from database if it has a dbId
  const dbId = bet.dbId;
  
  // Remove the bet from local state
  state.data.bets.splice(betIndex, 1);

  // Total score doesn't change when canceling bet
  // (No recalculation needed)

  persistState();
  syncUserToSupabase(user); // Sync updated balance
  if (dbId) {
    deleteBetFromSupabase(dbId); // Remove bet from database
  }
  
  publishRealtime("bet:cancelled", { userId: user.id, matchId: bet.matchId });
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

  const now = new Date();
  const todayYmd = toYmd(now, state.config.timezone);

  userBets.forEach((bet) => {
    const match = state.data.matches.find((entry) => entry.id === bet.matchId);
    const row = document.createElement("div");
    row.className = `history-row ${bet.outcome}`;
    const versus = match ? `${match.home} vs ${match.away}` : "Unknown match";

    let result = "Pending";
    if (bet.outcome === "win") result = `+${Math.round(bet.delta)} points earned`;
    if (bet.outcome === "loss") result = `-${bet.wager} coins lost`;

    const textSpan = document.createElement("span");
    textSpan.textContent = `Wagered ${bet.wager} coins on ${bet.pick} in ${versus} → ${result}`;
    row.appendChild(textSpan);
    
    // Add delete button for active bets if match is not today
    if (bet.status === "active" && match && match.day > todayYmd) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger";
      deleteBtn.style.cssText = "padding:4px 12px;font-size:12px;margin-left:10px";
      deleteBtn.innerHTML = '<i class="material-symbols-outlined" style="font-size:16px">delete</i> Cancel Bet';
      deleteBtn.title = "Cancel this bet and refund your coins";
      deleteBtn.addEventListener("click", () => {
        if (confirm(`Cancel bet of ${bet.wager} coins on ${bet.pick}? Your coins will be refunded.`)) {
          deleteBet(bet.id);
        }
      });
      row.appendChild(deleteBtn);
    }
    
    host.appendChild(row);
  });
}

function renderGroups() {
  const host = document.getElementById("group-list");
  host.innerHTML = "";

  // Calculate real standings from match results
  const groupStandings = calculateGroupStandings();

  Object.entries(WC_2026_GROUPS).forEach(([groupLetter, teams]) => {
    const card = document.createElement("article");
    card.className = "group-card";
    
    // Get standings for this group
    const standings = groupStandings[groupLetter] || {};
    
    // Sort teams by points (wins=3, draws=1, loss=0)
    const sortedTeams = teams
      .map(team => {
        const stats = standings[team] || { points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
        return { team, ...stats };
      })
      .sort((a, b) => {
        // Sort by points, then goal difference, then goals scored
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        return b.goalsFor - a.goalsFor;
      });

    const rows = sortedTeams
      .map((item) => {
        const gd = item.goalsFor - item.goalsAgainst;
        const gdStr = gd > 0 ? `+${gd}` : gd;
        return `<li>
          <span style="flex:1">${item.team}</span>
          <strong style="min-width:30px;text-align:center">${item.points} pts</strong>
          <span style="min-width:60px;text-align:center;color:var(--muted);font-size:0.9em">${item.wins}-${item.draws}-${item.losses}</span>
        </li>`;
      })
      .join("");

    card.innerHTML = `
      <h4>Group ${groupLetter}</h4>
      <ul style="display:flex;flex-direction:column;gap:8px">${rows}</ul>
    `;
    host.appendChild(card);
  });
}

function renderHomeGroups() {
  const host = document.getElementById("home-group-list");
  if (!host) return;
  
  host.innerHTML = "";

  // Calculate real standings from match results
  const groupStandings = calculateGroupStandings();

  Object.entries(WC_2026_GROUPS).forEach(([groupLetter, teams]) => {
    const card = document.createElement("article");
    card.className = "group-card";
    
    // Get standings for this group
    const standings = groupStandings[groupLetter] || {};
    
    // Sort teams by points (wins=3, draws=1, loss=0)
    const sortedTeams = teams
      .map(team => {
        const stats = standings[team] || { points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
        return { team, ...stats };
      })
      .sort((a, b) => {
        // Sort by points, then goal difference, then goals scored
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        return b.goalsFor - a.goalsFor;
      });

    const rows = sortedTeams
      .map((item) => {
        const gd = item.goalsFor - item.goalsAgainst;
        const gdStr = gd > 0 ? `+${gd}` : gd;
        return `<li>
          <span style="flex:1">${item.team}</span>
          <strong style="min-width:30px;text-align:center">${item.points} pts</strong>
          <span style="min-width:60px;text-align:center;color:var(--muted);font-size:0.9em">${item.wins}-${item.draws}-${item.losses}</span>
        </li>`;
      })
      .join("");

    card.innerHTML = `
      <h4>Group ${groupLetter}</h4>
      <ul style="display:flex;flex-direction:column;gap:8px">${rows}</ul>
    `;
    host.appendChild(card);
  });
}

function calculateGroupStandings() {
  const standings = {};
  
  // Initialize standings for all groups
  Object.entries(WC_2026_GROUPS).forEach(([groupLetter, teams]) => {
    standings[groupLetter] = {};
    teams.forEach(team => {
      standings[groupLetter][team] = {
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0
      };
    });
  });
  
  // Calculate standings from completed group stage matches
  state.data.matches
    .filter(m => m.group && m.status === "final" && m.resultHome != null && m.resultAway != null)
    .forEach(match => {
      const groupLetter = match.group.replace("Group ", "");
      if (!standings[groupLetter]) return;
      
      const homeStats = standings[groupLetter][match.home];
      const awayStats = standings[groupLetter][match.away];
      
      if (!homeStats || !awayStats) return;
      
      // Update goals
      homeStats.goalsFor += match.resultHome;
      homeStats.goalsAgainst += match.resultAway;
      awayStats.goalsFor += match.resultAway;
      awayStats.goalsAgainst += match.resultHome;
      
      // Update points and record
      if (match.resultHome > match.resultAway) {
        // Home win
        homeStats.wins++;
        homeStats.points += 3;
        awayStats.losses++;
      } else if (match.resultAway > match.resultHome) {
        // Away win
        awayStats.wins++;
        awayStats.points += 3;
        homeStats.losses++;
      } else {
        // Draw
        homeStats.draws++;
        awayStats.draws++;
        homeStats.points++;
        awayStats.points++;
      }
    });
  
  return standings;
}

function connectSupabase() {
  if (!state.config.supabaseUrl || !state.config.supabaseAnon || !window.supabase) {
    setSupabaseIndicator(false, "Supabase: Missing config");
    return Promise.resolve();
  }

  try {
    state.supabase = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnon);
    return testSupabaseConnection().then(async () => {
      // Load app settings from database (maxActiveBetsPerMatch)
      await loadAppSettings();
      
      // After connecting, load World Cup matches from database
      loadWorldCupMatchesFromDatabase().then(() => {
        // Update user scores from completed matches
        syncUserRankingsWithTeamStats();
      });
    });
  } catch {
    setSupabaseIndicator(false, "Supabase: Connection failed");
    setStatus("admin-settings-status", "Supabase connection failed. Check URL/anon key.");
    return Promise.resolve();
  }
}

async function callEdgeFunctionRefresh() {
  if (!state.supabase) {
    alert("Supabase not connected. Configure it in Settings first.");
    return;
  }

  try {
    console.log("Calling Edge Function to fetch matches from sports APIs...");
    
    const { data, error } = await state.supabase.functions.invoke("daily-refresh", {
      headers: {
        "x-refresh-token": "secret123" // Match the token set in Supabase secrets
      }
    });

    if (error) {
      console.error("Edge Function error:", error);
      alert(`Edge Function failed: ${error.message || 'Unknown error'}`);
      return;
    }

    console.log("Edge Function response:", data);
    
    if (data.success) {
      console.log(`✓ Edge Function loaded ${data.matchCount} matches from ${data.source}`);
      await loadWorldCupMatchesFromDatabase();
    } else {
      console.error(`Edge Function returned error: ${data.error || 'Unknown error'}`);
    }
    return data;
  } catch (err) {
    console.error("Failed to call Edge Function:", err);
    alert(`Error: ${err.message}`);
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
    
    // Load all community bets from Supabase
    await loadAllBetsFromSupabase();
    
    // Set up realtime channel
    const channel = state.supabase.channel("fc26-live");
    channel
      .on("broadcast", { event: "event" }, (payload) => {
        if (payload?.payload?.origin === state.data.currentUser) return;
        // Refresh community bets and re-render when another user places a bet
        loadAllBetsFromSupabase().then(() => renderApp());
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
        
        // Ensure new matches are added to state and groups get updated
        if (matches && matches.length > 0) {
          const newMatchIds = matches.map(m => m.id);
          state.data.matches = [...state.data.matches.filter(m => !newMatchIds.includes(m.id)), ...matches];
          updateDynamicGroupsAndTeams();
        }
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
  const resHome = dbMatch.result_home != null ? Number(dbMatch.result_home) : null;
  const resAway = dbMatch.result_away != null ? Number(dbMatch.result_away) : null;
  return {
    id: dbMatch.id,
    day: dbMatch.day,
    time: dbMatch.kickoff_time,
    home: dbMatch.home_team,
    away: dbMatch.away_team,
    group: dbMatch.tournament_group || null,
    odds: {
      home: Number(dbMatch.odds_home),
      away: Number(dbMatch.odds_away)
    },
    status: dbMatch.status,
    resultHome: resHome,
    resultAway: resAway,
    result: dbMatch.winner ? {
      winner: dbMatch.winner,
      home: resHome,
      away: resAway,
      homeScore: resHome,
      awayScore: resAway
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
        status: "open",  // Changed from "scheduled" to "open" so betting is available
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
    balance: 100,
    teamPoints: 0,
    betPoints: 0,
    totalScore: 0,
    coinsEarnedFromTeams: 0,
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
    balance: 100,
    teamPoints: 0,
    betPoints: 0,
    totalScore: 0,
    coinsEarnedFromTeams: 0,
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

function convertUtcToPst(utcTimeString) {
  // Convert UTC time (e.g., "19:00") to PST time (e.g., "12:00 PM")
  const [hours, minutes] = utcTimeString.split(":").map(Number);
  
  // PST is UTC-8, PDT is UTC-7
  // For simplicity, using UTC-7 (PDT) since World Cup is in June/July
  const pstHours = (hours - 7 + 24) % 24;
  
  // Format to 12-hour time
  const period = pstHours >= 12 ? "PM" : "AM";
  const displayHours = pstHours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  
  return `${displayHours}:${displayMinutes} ${period}`;
}

function setupMidnightRefresh() {
  // Check every minute if we've crossed midnight PST
  let lastCheckedDay = toYmd(new Date(), "America/Los_Angeles");
  let checkCount = 0;
  
  // Update status displays initially
  updateRefreshStatusDisplays();
  
  setInterval(() => {
    checkCount++;
    const currentDay = toYmd(new Date(), "America/Los_Angeles");
    
    // Update displays every minute
    updateRefreshStatusDisplays();
    
    if (currentDay !== lastCheckedDay) {
      console.log(`🌙 MIDNIGHT CROSSED (PST). New day: ${currentDay}. Running daily refresh...`);
      lastCheckedDay = currentDay;
      runDailyRefresh(false).then(() => {
        console.log("✅ Midnight auto-refresh completed successfully");
        updateRefreshStatusDisplays();
        renderApp(); // Re-render to show updated data
      }).catch(err => {
        console.error("❌ Auto midnight refresh failed:", err);
      });
    } else {
      // Log every 60 checks (once per hour)
      if (checkCount % 60 === 0) {
        console.log(`⏰ Midnight check #${checkCount}: Still ${currentDay}, waiting for day change...`);
      }
    }
  }, 60000); // Check every minute
  
  console.log("🔄 Midnight auto-refresh timer initialized (checks every 60 seconds)");
}

function updateRefreshStatusDisplays() {
  const lastRefresh = state.data.cache.lastRefreshedAt;
  const lastRefreshYmd = state.data.cache.lastRefreshYmd;
  
  let displayText = "Never";
  if (lastRefresh) {
    const refreshDate = new Date(lastRefresh);
    const today = toYmd(new Date(), "America/Los_Angeles");
    
    if (lastRefreshYmd === today) {
      displayText = `Today at ${refreshDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} PST`;
    } else {
      displayText = `${lastRefreshYmd} at ${refreshDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} PST`;
    }
  }
  
  // Update admin displays
  const adminLastRefresh = document.getElementById("last-refresh-display");
  if (adminLastRefresh) adminLastRefresh.textContent = displayText;
  
  // Update user displays
  const userLastRefresh = document.getElementById("user-last-refresh-display");
  if (userLastRefresh) userLastRefresh.textContent = displayText;
  
  // Calculate next midnight PST
  const now = new Date();
  const pstNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const nextMidnight = new Date(pstNow);
  nextMidnight.setHours(24, 0, 0, 0);
  
  const hoursUntilMidnight = Math.floor((nextMidnight - pstNow) / (1000 * 60 * 60));
  const minutesUntilMidnight = Math.floor(((nextMidnight - pstNow) % (1000 * 60 * 60)) / (1000 * 60));
  
  const nextCheckDisplay = document.getElementById("next-check-display");
  if (nextCheckDisplay) {
    nextCheckDisplay.textContent = `Next midnight: ${hoursUntilMidnight}h ${minutesUntilMidnight}m`;
  }
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

