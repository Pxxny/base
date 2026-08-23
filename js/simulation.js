// ============================================================
// BATTING/PITCHING SIMULATION (probabilistic, attribute-driven)
// ============================================================
// Depends on js/player.js (battingOverall, pitchingOverall, isPitcher,
// createPlayer) and js/leagues.js (rnd/pick/clamp).
//
// This module also implements inning-by-inning play-by-play recording
// (game.log) so the UI can either show a game unfold frame-by-frame on
// game day, or fast-forward through it ("Sim") and just read the final
// box score - both paths use the exact same simulateGame() result.

// Simulates one plate appearance outcome given batter vs pitcher attributes.
function simPlateAppearance(batter, pitcher) {
  const bOv = isPitcher(batter.position) ? 40 : battingOverall(batter);
  const pOv = pitcher ? pitchingOverall(pitcher) : 50;
  const b = batter.batting;
  const diff = bOv - pOv; // positive favors batter

  // Base probabilities (league-average-ish), shifted by skill diff
  let kChance = clamp(0.22 - diff * 0.0016 - (b.plateDiscipline - 50) * 0.001, 0.05, 0.45);
  let bbChance = clamp(0.09 + diff * 0.0012 + (b.plateDiscipline - 50) * 0.0012, 0.02, 0.2);
  let hitChance = clamp(0.255 + diff * 0.0022 + (b.contact - 50) * 0.0012, 0.12, 0.42);

  const r = Math.random();
  if (r < kChance) return { result: "SO" };
  if (r < kChance + bbChance) return { result: "BB" };
  if (r < kChance + bbChance + hitChance) {
    // Determine hit type
    const powerFactor = (b.power - 50) / 100;
    const speedFactor = (b.speed - 50) / 100;
    const hr = clamp(0.11 + powerFactor * 0.18, 0.02, 0.35);
    const triple = clamp(0.02 + speedFactor * 0.03, 0.002, 0.06);
    const double = clamp(0.19 + (b.gapPower - 50) * 0.002, 0.08, 0.32);
    const hr2 = Math.random();
    if (hr2 < hr) return { result: "HR" };
    if (hr2 < hr + triple) return { result: "3B" };
    if (hr2 < hr + triple + double) return { result: "2B" };
    return { result: "1B" };
  }
  // Ball in play out - could be sac fly / ground out etc, simplified to OUT
  return { result: "OUT" };
}

// Human-readable description of a plate appearance result, for the
// inning-by-inning play-by-play log.
function describePAResult(batter, result, runsScored, outsAfter) {
  const name = batter.name;
  switch (result) {
    case "SO": return `${name} strikes out.`;
    case "BB": return `${name} draws a walk.`;
    case "OUT": return runsScored > 0
      ? `${name} puts it in play — a run scores on the play.`
      : `${name} grounds/flies out.`;
    case "1B": return `${name} singles.`;
    case "2B": return `${name} doubles.`;
    case "3B": return `${name} triples.`;
    case "HR": return `${name} homers${runsScored > 1 ? ` (${runsScored}-run HR)` : ""}!`;
    default: return `${name}: ${result}`;
  }
}

function applyPAResult(game, battingTeamKey, batter, pitcher, result, inning) {
  const stats = game.playerLine(batter);
  const pstats = pitcher ? game.pitcherLine(pitcher) : null;
  stats.PA++;
  if (pstats) pstats.BF = (pstats.BF || 0) + 1;

  const advanceRunners = (bases, numAdvance, scoreOnHome = true) => {
    let runsScored = 0;
    for (let i = 3; i >= 0; i--) {
      if (bases[i]) {
        const newBase = i + numAdvance;
        if (newBase >= 3) { runsScored++; bases[i] = null; }
        else { bases[newBase] = bases[i]; if (newBase !== i) bases[i] = null; }
      }
    }
    return runsScored;
  };

  const bases = game.bases[battingTeamKey];
  let runs = 0;

  switch (result) {
    case "SO":
      stats.AB++; stats.SO++;
      if (pstats) pstats.SO++;
      game.outs[battingTeamKey]++;
      break;
    case "BB":
      stats.BB++;
      if (pstats) pstats.BB++;
      // force advance only where needed
      if (bases[0]) {
        if (bases[1]) {
          if (bases[2]) runs++;
          bases[2] = bases[1];
        }
        bases[1] = bases[0];
      }
      bases[0] = batter;
      break;
    case "OUT":
      stats.AB++;
      game.outs[battingTeamKey]++;
      // occasionally advance a runner (sac-like), simplified: 15% chance runner on 3rd scores
      if (bases[2] && Math.random() < 0.35 && game.outs[battingTeamKey] <= 2) {
        runs++; bases[2] = null;
      }
      break;
    case "1B":
      stats.AB++; stats.H++; stats["1B"]++;
      if (pstats) pstats.H = (pstats.H || 0) + 1;
      runs += advanceRunners(bases, 1);
      bases[0] = batter;
      break;
    case "2B":
      stats.AB++; stats.H++; stats["2B"]++;
      if (pstats) pstats.H = (pstats.H || 0) + 1;
      runs += advanceRunners(bases, 2);
      bases[1] = batter;
      break;
    case "3B":
      stats.AB++; stats.H++; stats["3B"]++;
      if (pstats) pstats.H = (pstats.H || 0) + 1;
      runs += advanceRunners(bases, 3);
      bases[2] = batter;
      break;
    case "HR":
      stats.AB++; stats.H++; stats.HR++;
      if (pstats) pstats.H = (pstats.H || 0) + 1;
      runs += advanceRunners(bases, 3); // clears bases
      runs += 1; // batter scores
      stats.RBI += runs;
      break;
  }
  if (result !== "HR" && runs > 0) stats.RBI += runs;
  if (pstats && runs > 0) pstats.ER = (pstats.ER || 0) + runs;
  game.score[battingTeamKey] += runs;
  return runs;
}

// Simulate a full 9-inning game between two teams (lineups of 9 batters + pitcher rotation).
// opts.recordLog (default true) captures a per-half-inning play-by-play in game.log so the
// UI can step through the game inning by inning instead of only showing the final result.
function simulateGame(homeTeam, awayTeam, opts = {}) {
  const recordLog = opts.recordLog !== false;
  const game = {
    bases: { home: [null, null, null], away: [null, null, null] },
    outs: { home: 0, away: 0 },
    score: { home: 0, away: 0 },
    lines: new Map(),
    pitcherLines: new Map(),
    log: [], // array of { inning, half: "top"|"bottom", plays: [string], runsThisHalf, scoreAfter: {home,away} }
    playerLine(p) {
      if (!this.lines.has(p.id)) this.lines.set(p.id, { player: p, PA: 0, AB: 0, H: 0, "1B": 0, "2B": 0, "3B": 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 });
      return this.lines.get(p.id);
    },
    pitcherLine(p) {
      if (!this.pitcherLines.has(p.id)) this.pitcherLines.set(p.id, { player: p, outs: 0, H: 0, ER: 0, BB: 0, SO: 0, BF: 0 });
      return this.pitcherLines.get(p.id);
    }
  };

  const homeLineup = getActiveLineup(homeTeam);
  const awayLineup = getActiveLineup(awayTeam);
  const homePitcher = getStartingPitcher(homeTeam);
  const awayPitcher = getStartingPitcher(awayTeam);

  let homeIdx = 0, awayIdx = 0;
  const maxInnings = 9;
  for (let inning = 1; inning <= maxInnings || game.score.home === game.score.away; inning++) {
    // Away bats top, Home bats bottom
    game.outs.away = 0; game.bases.away = [null, null, null];
    const topPlays = [];
    let topRunsBefore = game.score.away;
    while (game.outs.away < 3 && awayLineup.length) {
      const batter = awayLineup[awayIdx % awayLineup.length]; awayIdx++;
      const res = simPlateAppearance(batter, homePitcher);
      const runs = applyPAResult(game, "away", batter, homePitcher, res.result, inning);
      if (recordLog) topPlays.push(describePAResult(batter, res.result, runs, game.outs.away));
    }
    if (recordLog) game.log.push({
      inning, half: "top", plays: topPlays,
      runsThisHalf: game.score.away - topRunsBefore,
      scoreAfter: { home: game.score.home, away: game.score.away }
    });

    if (inning >= maxInnings && game.score.home > game.score.away) break;

    game.outs.home = 0; game.bases.home = [null, null, null];
    const bottomPlays = [];
    let bottomRunsBefore = game.score.home;
    while (game.outs.home < 3 && homeLineup.length) {
      const batter = homeLineup[homeIdx % homeLineup.length]; homeIdx++;
      const res = simPlateAppearance(batter, awayPitcher);
      const runs = applyPAResult(game, "home", batter, awayPitcher, res.result, inning);
      if (recordLog) bottomPlays.push(describePAResult(batter, res.result, runs, game.outs.home));
      // Walk-off: home team takes the lead in the bottom of the 9th (or later) - game ends immediately
      if (inning >= maxInnings && game.score.home > game.score.away) break;
    }
    if (recordLog) game.log.push({
      inning, half: "bottom", plays: bottomPlays,
      runsThisHalf: game.score.home - bottomRunsBefore,
      scoreAfter: { home: game.score.home, away: game.score.away }
    });

    if (inning >= maxInnings + 15) break; // safety valve for extras
  }

  // finalize pitcher outs (approx = 3 * innings / 2 shared, simplified even split)
  const totalOutsAway = 27, totalOutsHome = 27;
  if (game.pitcherLines.has(homePitcher.id)) game.pitcherLines.get(homePitcher.id).outs = totalOutsAway;
  if (game.pitcherLines.has(awayPitcher.id)) game.pitcherLines.get(awayPitcher.id).outs = totalOutsHome;

  const winner = game.score.home >= game.score.away ? homeTeam : awayTeam;
  const loser = winner === homeTeam ? awayTeam : homeTeam;
  return { game, homeTeam, awayTeam, homeScore: game.score.home, awayScore: game.score.away, winner, loser, winningPitcher: winner === homeTeam ? homePitcher : awayPitcher, losingPitcher: loser === homeTeam ? homePitcher : awayPitcher };
}

function getActiveLineup(team) {
  const healthy = (team.roster || []).filter(p => !isPitcher(p.position) && p.health.status === "Healthy");
  if (healthy.length >= 9) return healthy.sort((a, b) => battingOverall(b) - battingOverall(a)).slice(0, 9);
  return healthy.length ? healthy : (team.roster || []).filter(p => !isPitcher(p.position)).slice(0, 9);
}
function getStartingPitcher(team) {
  // Use the best available starters (rotation), not a uniform-random arm off the whole staff -
  // otherwise a top-9 optimized lineup faces an average-of-all-arms pitcher and stats skew heavily
  // toward hitters (inflated ERA/hits across the league).
  const sps = (team.roster || []).filter(p => p.position === "SP" && p.health.status === "Healthy")
    .sort((a, b) => pitchingOverall(b) - pitchingOverall(a));
  if (sps.length) return pick(sps.slice(0, Math.max(1, Math.ceil(sps.length / 2))));
  const anyP = (team.roster || []).filter(p => isPitcher(p.position)).sort((a, b) => pitchingOverall(b) - pitchingOverall(a));
  return anyP.length ? anyP[0] : createPlayer({ position: "SP" });
}

// Apply box score lines into player season/career stats
function commitGameStats(result) {
  for (const line of result.game.lines.values()) {
    const p = line.player;
    const s = p.seasonStats.batting;
    s.G++; s.PA += line.PA; s.AB += line.AB; s.H += line.H;
    s["1B"] += line["1B"]; s["2B"] += line["2B"]; s["3B"] += line["3B"]; s.HR += line.HR;
    s.RBI += line.RBI; s.BB += line.BB; s.SO += line.SO;
    if ((p.teamId === result.winner.id)) s.R += Math.round(line.RBI * 0.6); // approximation
  }
  for (const line of result.game.pitcherLines.values()) {
    const p = line.player;
    const s = p.seasonStats.pitching;
    s.G++;
    if (p === result.winningPitcher) s.W++;
    if (p === result.losingPitcher) s.L++;
    s.IP += line.outs / 3;
    s.H += line.H; s.ER += line.ER; s.BB += line.BB; s.SO += line.SO;
  }
}
