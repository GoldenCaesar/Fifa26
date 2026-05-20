// This file contains the key changes needed to implement real stats instead of demo stats

// ═══════════════════════════════════════════════════════════════════════════
// 1. INITIALIZE TEAM STATS - Add to createInitialState
// ═══════════════════════════════════════════════════════════════════════════

// Add to state.data:
teamStats: initializeTeamStats(),

function initializeTeamStats() {
  const stats = {};
  WC_TEAMS.forEach(team => {
    stats[team] = { goals: 0, wins: 0, draws: 0, losses: 0 };
  });
  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. UPDATE lockUserPicks - Start with 0 goals/wins
// ═══════════════════════════════════════════════════════════════════════════

function lockUserPicks() {
  if (picksState.length !== 5) return;
  const user = getCurrentUser();
  if (!user) return;

  user.rankings = picksState.map((team, index) => ({
    team,
    rank: index + 1,
    rankBonus: 6 - (index + 1),
    goals: 0,  // Changed from random
    wins: 0    // Changed from random
  }));
  user.picksLocked = true;
  user.pendingPicks = [];
  user.totalScore = recalcScore(user) + Math.floor(user.balance / 10);
  persistState();

  document.getElementById("screen-picks").classList.remove("active");
  enterApp();
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. UPDATE TEAM STATS FROM MATCH RESULTS
// ═══════════════════════════════════════════════════════════════════════════

function updateTeamStatsFromMatch(match) {
  if (!match.result || !state.data.teamStats) return;
  
  const homeTeam = match.home;
  const awayTeam = match.away;
  const result = match.result;
  
  // Update goals
  if (!state.data.teamStats[homeTeam]) {
    state.data.teamStats[homeTeam] = { goals: 0, wins: 0, draws: 0, losses: 0 };
  }
  if (!state.data.teamStats[awayTeam]) {
    state.data.teamStats[awayTeam] = { goals: 0, wins: 0, draws: 0, losses: 0 };
  }
  
  state.data.teamStats[homeTeam].goals += result.home;
  state.data.teamStats[awayTeam].goals += result.away;
  
  // Update wins/draws/losses
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

// ═══════════════════════════════════════════════════════════════════════════
// 4. UPDATE USER RANKINGS FROM GLOBAL TEAM STATS
// ═══════════════════════════════════════════════════════════════════════════

function syncUserRankingsWithTeamStats() {
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

// ═══════════════════════════════════════════════════════════════════════════
// 5. REPLACE recomputeLeaderboard - Use real scores
// ═══════════════════════════════════════════════════════════════════════════

function recomputeLeaderboard() {
  // Sync all user rankings with current team stats
  syncUserRankingsWithTeamStats();
  
  // Update leaderboard with current scores (not fake history)
  state.data.leaderboard.forEach((row) => {
    const user = state.data.users.find((entry) => entry.id === row.userId);
    if (!user) return;
    
    // Store current score as a snapshot
    if (!row.scoreHistory) row.scoreHistory = [];
    row.scoreHistory.push({
      timestamp: new Date().toISOString(),
      score: user.totalScore
    });
    
    // Keep last 30 days only
    if (row.scoreHistory.length > 30) row.scoreHistory.shift();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. REPLACE renderHomeGraph - Show actual scores with labels
// ═══════════════════════════════════════════════════════════════════════════

function renderHomeGraph(withBurst) {
  const canvas = document.getElementById("leaderboard-canvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const users = state.data.users.filter(u => u.picksLocked);
  const colors = ["#ff00ff", "#39ff14", "#ffd700", "#8fb7ff", "#ff955e"];

  ctx.clearRect(0, 0, width, height);
  
  if (users.length === 0) return;
  
  // Sort by score descending
  const sorted = [...users].sort((a, b) => b.totalScore - a.totalScore);
  const maxScore = Math.max(...sorted.map(u => u.totalScore), 100);
  
  const barWidth = (width - 60) / sorted.length;
  const padding = 15;
  
  let top = { userId: null, score: -Infinity };
  
  sorted.forEach((user, index) => {
    const color = colors[index % colors.length];
    const barHeight = (user.totalScore / maxScore) * (height - 80);
    const x = padding + index * barWidth + barWidth * 0.1;
    const y = height - barHeight - 40;
    const w = barWidth * 0.8;
    
    // Draw bar
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fillRect(x, y, w, barHeight);
    
    // Draw score label
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 0;
    ctx.font = "bold 11px 'Be Vietnam Pro'";
    ctx.textAlign = "center";
    ctx.fillText(user.totalScore.toLocaleString(), x + w / 2, y - 5);
    
    // Draw player name
    ctx.font = "600 10px 'Be Vietnam Pro'";
    ctx.fillStyle = user.id === state.data.currentUser ? color : "#a8a0ad";
    ctx.save();
    ctx.translate(x + w / 2, height - 10);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(user.handle, 0, 0);
    ctx.restore();
    
    if (user.totalScore > top.score) {
      top = { userId: user.id, score: user.totalScore };
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

// ═══════════════════════════════════════════════════════════════════════════
// 7. UPDATE settleYesterdayBets - Also update team stats
// ═══════════════════════════════════════════════════════════════════════════

function settleYesterdayBets(todayYmd) {
  const yesterday = shiftYmd(todayYmd, -1);
  const yesterdayMatches = state.data.matches.filter((match) => match.day === yesterday);

  yesterdayMatches.forEach((match) => {
    if (!match.result) {
      match.result = randomResult(match.home, match.away);
      match.status = "final";
      
      // NEW: Update team stats from match result
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
    });
  
  // NEW: Sync all user rankings with updated team stats
  syncUserRankingsWithTeamStats();
}
