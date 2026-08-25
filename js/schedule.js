// ============================================================
// DRAFT SYSTEM
// ============================================================
// Depends on js/player.js, js/teams.js, js/contracts.js, js/leagues.js.

function generateDraftClass(state, size = 200) {
  const cls = [];
  if (state.player && ["HS", "College", "Draft Prospect"].includes(state.player.level)) {
    cls.push(state.player);
  }
  for (let i = cls.length; i < size; i++) {
    const age = rnd(18, 22);
    const p = createPlayer({ age, levelHint: rnd(25, 55) });
    p.level = age <= 18 ? "HS" : "College";
    cls.push(p);
  }
  // Draft projection based on overall + potential + a scouting-error random factor
  for (const p of cls) {
    const ov = overallRating(p);
    const scoutingError = rnd(-15, 15);
    p.draftInfo = { projection: clamp(ov + p.potential * 0.3 + scoutingError, 1, 100) };
  }
  cls.sort((a, b) => b.draftInfo.projection - a.draftInfo.projection);
  state.draftClass = cls;
  return cls;
}

function runDraft(state, rounds = 10) {
  const teams = [...MLB_TEAMS]; // MLB draft; NPB/KBO could have separate drafts later
  const results = [];
  let overallPick = 1;
  const pool = [...state.draftClass];
  // Reverse standings order simulated by random order per round (simplified)
  for (let round = 1; round <= rounds; round++) {
    const order = [...teams].sort(() => Math.random() - 0.5);
    for (const team of order) {
      if (!pool.length) break;
      // Team picks best available with some randomness/need factor
      const idx = weightedBestAvailableIndex(pool);
      const player = pool.splice(idx, 1)[0];
      player.draftInfo.round = round;
      player.draftInfo.pick = overallPick;
      player.draftInfo.team = team.id;
      player.teamId = team.id;
      player.orgId = team.id;
      player.level = "Rookie";
      player.contract = generateContract(player, "Rookie", 1);
      results.push({ round, pick: overallPick, team: team.id, player });
      overallPick++;
    }
  }
  state.draftResults = results;
  return results;
}

function weightedBestAvailableIndex(pool) {
  // Mostly best player available, occasional reach
  const window = Math.min(pool.length, Math.random() < 0.7 ? 1 : rnd(2, 6));
  return rnd(0, window - 1);
}

// ============================================================
// GAME SIMULATION LOOP (season)
// ============================================================
function buildSeasonSchedule(state, leagueKey) {
  const teams = state.allTeams.filter(t => t.league === leagueKey);
  const games = LEAGUES[leagueKey].regularSeasonGames;
  const schedule = [];
  const gamesPerOpponent = Math.max(1, Math.floor(games / (teams.length - 1)));
  for (let g = 0; g < games; g++) {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      schedule.push({ home: shuffled[i].id, away: shuffled[i + 1].id, played: false });
    }
  }
  return schedule;
}

// Groups this-day's matchups: MLB/NPB/KBO pair off within their league,
// minor-league teams pair off within their own named league (leagueGroup)
// so a Triple-A International League team never faces a Rookie-level
// Dominican Rookie League team.
function todaysMatchupGroups(state) {
  const groups = [];
  for (const leagueKey of ["MLB", "NPB", "KBO"]) {
    groups.push(state.allTeams.filter(t => t.league === leagueKey));
  }
  const minorGroups = {};
  for (const t of state.allTeams) {
    if (t.league !== "MINORS") continue;
    (minorGroups[t.leagueGroup] = minorGroups[t.leagueGroup] || []).push(t);
  }
  for (const key of Object.keys(minorGroups)) groups.push(minorGroups[key]);
  return groups;
}

// True once the current season has run its full schedule length for
// whatever level the player is at. Defined here defensively (career.js,
// which owns the real seasonLengthDaysForPlayer(), loads after this
// file) so simDay/simWeek/simMonth can refuse to advance the calendar
// past the season's actual length even if a caller forgets to check.
function seasonHasEnded(state) {
  if (!state.player || typeof seasonLengthDaysForPlayer !== "function") return false;
  return state.day >= seasonLengthDaysForPlayer(state.player);
}

function simDay(state) {
  // Simulate one day across all leagues (majors + every named minor
  // league): every team plays if scheduled. Refuses to run - and so
  // never increments state.day - once the season has already played
  // out its full schedule; the day counter used to climb forever
  // (past 365/366+) because nothing ever stopped it here.
  if (seasonHasEnded(state)) return [];
  const results = [];
  for (const teams of todaysMatchupGroups(state)) {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const home = shuffled[i], away = shuffled[i + 1];
      const userTeamId = state.player ? (state.player.teamId || state.player.orgId) : null;
      const isUserGame = !!userTeamId && (home.id === userTeamId || away.id === userTeamId);
      const userOpp = isUserGame ? (home.id === userTeamId ? away : home) : null;
      const rivalry = isUserGame && state.player && !isPitcher(state.player.position) ? rivalryModifierForGame(state, state.teams[userTeamId], userOpp) : null;
      if (rivalry) rivalry.pitcherEffects = Object.fromEntries(Object.values(state.rivalries || {}).filter(r => r.kind === "pitcher").map(r => [r.id, clamp((r.redemption || 0) - (r.pressure || 0), -12, 12)]));
      const result = simulateGame(home, away, { recordLog: false, rivalry });
      commitGameStats(result);
      updateUserRivalries(state, result);
      if (typeof recordUserTeamH2H === "function") recordUserTeamH2H(state, result);
      trackBenchedIfApplicable(state, result);
      result.winner.wins++;
      result.loser.losses++;
      // random injuries for participants
      for (const line of result.game.lines.values()) maybeRandomInjury(line.player);
      results.push(result);
    }
  }
  state.day++;
  processTransactions(state);
  // advance injuries
  for (const t of state.allTeams) for (const p of t.roster) advanceInjuryDays(p);
  if (state.player) { advanceInjuryDays(state.player); recoverFatigue(state.player); }
  return results;
}

function simWeek(state) { const out = []; for (let i = 0; i < 6; i++) { if (seasonHasEnded(state)) break; out.push(...simDay(state)); } return out; }
function simMonth(state) { const out = []; for (let i = 0; i < 4; i++) { if (seasonHasEnded(state)) break; out.push(...simWeek(state)); } return out; }

// ------------------------------------------------------------
// GAME DAY: simulate today's slate but track the user's own
// team's game separately, WITH a full inning-by-inning log, so
// the UI can offer "watch it inning by inning" or "just sim it".
// ------------------------------------------------------------
function simDayWithUserGame(state) {
  if (seasonHasEnded(state)) return { results: [], userGameResult: null };
  const results = [];
  let userGameResult = null;
  const userTeamId = state.player ? (state.player.teamId || state.player.orgId) : null;

  for (const teams of todaysMatchupGroups(state)) {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const home = shuffled[i], away = shuffled[i + 1];
      const isUserGame = userTeamId && (home.id === userTeamId || away.id === userTeamId);
      const userOpp = isUserGame ? (home.id === userTeamId ? away : home) : null;
      const rivalry = isUserGame && state.player && !isPitcher(state.player.position) ? rivalryModifierForGame(state, state.teams[userTeamId], userOpp) : null;
      if (rivalry) rivalry.pitcherEffects = Object.fromEntries(Object.values(state.rivalries || {}).filter(r => r.kind === "pitcher").map(r => [r.id, clamp((r.redemption || 0) - (r.pressure || 0), -12, 12)]));
      const result = simulateGame(home, away, { recordLog: isUserGame, rivalry });
      commitGameStats(result);
      updateUserRivalries(state, result);
      if (typeof recordUserTeamH2H === "function") recordUserTeamH2H(state, result);
      trackBenchedIfApplicable(state, result);
      result.winner.wins++;
      result.loser.losses++;
      for (const line of result.game.lines.values()) maybeRandomInjury(line.player);
      results.push(result);
      if (isUserGame) userGameResult = result;
    }
  }
  state.day++;
  processTransactions(state);
  for (const t of state.allTeams) for (const p of t.roster) advanceInjuryDays(p);
  if (state.player) { advanceInjuryDays(state.player); recoverFatigue(state.player); }
  return { results, userGameResult };
}
