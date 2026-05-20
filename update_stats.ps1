# PowerShell script to update app.js with real stats implementation

$file = "app.js"
$content = Get-Content $file -Raw

# 1. Update lockUserPicks to start with 0 goals and wins
$content = $content -replace 'goals: 6 \+ Math\.floor\(Math\.random\(\) \* 8\)', 'goals: 0'
$content = $content -replace 'wins: 2 \+ Math\.floor\(Math\.random\(\) \* 6\)', 'wins: 0'

# 2. Add teamStats initialization - find createInitialState and add teamStats
$oldInitState = 'cache: \{
      daySchedules: \{\},
      lastRefreshYmd: "",
      lastRefreshedAt: "",
      lastLeader: "",
      oddsByDay: \{\} // Add odds cache
    \}'

$newInitState = 'cache: {
      daySchedules: {},
      lastRefreshYmd: "",
      lastRefreshedAt: "",
      lastLeader: "",
      oddsByDay: {}
    },
    teamStats: initializeTeamStats()'

$content = $content -replace [regex]::Escape($oldInitState), $newInitState

# 3. Add helper functions after deleteUser function
$insertPoint = 'function deleteUser\(userId\) \{[^}]+\}'
if ($content -match $insertPoint) {
    $helperFunctions = @"

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
"@
    $content = $content -replace '(function deleteUser\(userId\) \{[^}]+\})', "`$1$helperFunctions"
}

# Save the updated content
$content | Set-Content $file -NoNewline

Write-Host "Updated app.js with real stats foundation" -ForegroundColor Green
