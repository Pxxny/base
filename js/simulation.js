// ============================================================
// BATTING/PITCHING SIMULATION (probabilistic, attribute-driven)
// ============================================================
// Depends on js/player.js (battingOverall, pitchingOverall, isPitcher,
// createPlayer), js/leagues.js (rnd/pick/clamp), and js/coach.js
// (buildLineup, pickStartingPitcher, bullpenOptions, benchOptions) for
// who's on the field.
//
// This module also implements inning-by-inning play-by-play recording
// (game.log) so the UI can either show a game unfold frame-by-frame on
// game day, or fast-forward through it ("Sim") and just read the final
// box score - both paths use the exact same simulateGame() result. Each
// plate appearance now also records a pitch-level snapshot (count,
// pitch type/velocity, bases, current batter/pitcher) in game.pitchLog
// so a "live" game-day view can show what's happening on the field, not
// just the final line.

const PITCH_TYPE_VELO_BASE = {
  "Fastball": 92, "2-Seam Fastball": 91, "Cutter": 89, "Slider": 84,
  "Curveball": 78, "Changeup": 83, "Splitter": 85, "Knuckleball": 68
};

// Picks a pitch type from the pitcher's repertoire and a velocity reading
// for it, scaled by the pitcher's actual velocity attribute so a flame-
// thrower's fastball reads faster than a finesse guy's.
function rollPitch(pitcher) {
  const repertoire = (pitcher && pitcher.pitchTypes && pitcher.pitchTypes.length) ? pitcher.pitchTypes : ["Fastball"];
  const type = pick(repertoire);
  const base = PITCH_TYPE_VELO_BASE[type] || 88;
  const veloAttr = pitcher && pitcher.pitching ? pitcher.pitching.velocity : 50;
  const veloAdj = (veloAttr - 50) * 0.12; // attribute 20-100 -> roughly -3.6 to +6 mph
  const mph = Math.round(clamp(base + veloAdj + rnd(-2, 2), 62, 104));
  return { type, mph };
}

// Simulates one plate appearance outcome given batter vs pitcher attributes.
// onPitch(pitchInfo) is an optional callback invoked for each simulated
// pitch of the at-bat (for the pitch-by-pitch log), receiving the pitch
// and running count.
function simPlateAppearance(batter, pitcher, onPitch) {
  const bOv = isPitcher(batter.position) ? 40 : battingOverall(batter);
  const pOv = pitcher ? pitchingOverall(pitcher) : 50;
  const b = batter.batting;
  const diff = bOv - pOv; // positive favors batter

  // Base probabilities (league-average-ish), shifted by skill diff
  let kChance = clamp(0.22 - diff * 0.0016 - (b.plateDiscipline - 50) * 0.001, 0.05, 0.45);
  let bbChance = clamp(0.09 + diff * 0.0012 + (b.plateDiscipline - 50) * 0.0012, 0.02, 0.2);
  let hitChance = clamp(0.255 + diff * 0.0022 + (b.contact - 50) * 0.0012, 0.12, 0.42);

  // Simulate a plausible pitch count for this at-bat (cosmetic — the
  // eventual outcome is still governed by the probabilities above) so
  // the live view has a believable ball-strike sequence to show.
  let balls = 0, strikes = 0;
  const pitchCount = rnd(1, 6);
  for (let i = 0; i < pitchCount; i++) {
    const pitch = rollPitch(pitcher);
    if (Math.random() < 0.42) balls = Math.min(3, balls + 1);
    else strikes = Math.min(2, strikes + 1);
    if (onPitch) onPitch({ ...pitch, balls, strikes });
  }

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

function describeSub(kind, outPlayer, inPlayer, note) {
  if (kind === "pitching") return `Pitching change: ${inPlayer.name} replaces ${outPlayer.name}${note ? ` (${note})` : ""}.`;
  return `Substitution: ${inPlayer.name} in for ${outPlayer.name}${note ? ` (${note})` : ""}.`;
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

// Simulate a full 9-inning game between two teams (lineups built by each
// team's coach — see js/coach.js — rather than a naive top-9-by-OVR pick,
// so a lower-rated player, including the user, still has a real chance of
// being in the lineup rather than being permanently benched).
// opts.recordLog (default true) captures a per-half-inning play-by-play in game.log, AND a
// pitch-level game.pitchLog (one entry per plate appearance with the full pitch sequence,
// count, bases, and who's on the mound/at the plate) so the UI can either show a game unfold
// frame-by-frame on game day, or fast-forward through it and just read the final box score.
function simulateGame(homeTeam, awayTeam, opts = {}) {
  const recordLog = opts.recordLog !== false;
  const game = {
    bases: { home: [null, null, null], away: [null, null, null] },
    outs: { home: 0, away: 0 },
    score: { home: 0, away: 0 },
    lines: new Map(),
    pitcherLines: new Map(),
    log: [], // array of { inning, half: "top"|"bottom", plays: [string], runsThisHalf, scoreAfter: {home,away} }
    pitchLog: [], // array of per-PA snapshots for the live game-day view (see below)
    subs: [], // array of { inning, half, kind: "pitching"|"batting", team: "home"|"away", outPlayer, inPlayer, note, description }
    playerLine(p) {
      if (!this.lines.has(p.id)) this.lines.set(p.id, { player: p, PA: 0, AB: 0, H: 0, "1B": 0, "2B": 0, "3B": 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 });
      return this.lines.get(p.id);
    },
    pitcherLine(p) {
      if (!this.pitcherLines.has(p.id)) this.pitcherLines.set(p.id, { player: p, outs: 0, H: 0, ER: 0, BB: 0, SO: 0, BF: 0 });
      return this.pitcherLines.get(p.id);
    }
  };

  const homeLineupInfo = buildLineup(homeTeam);
  const awayLineupInfo = buildLineup(awayTeam);
  const homeLineup = homeLineupInfo.order.map(o => o.player);
  const awayLineup = awayLineupInfo.order.map(o => o.player);
  let homePitcher = pickStartingPitcher(homeTeam);
  let awayPitcher = pickStartingPitcher(awayTeam);
  const homeStartingPitcher = homePitcher, awayStartingPitcher = awayPitcher;

  // Track simple pitch-count fatigue so starters occasionally get pulled
  // for a reliever in a long outing, purely for game-day flavor/realism.
  const pitchCounts = new Map([[homePitcher.id, 0], [awayPitcher.id, 0]]);
  const bumpPitchCount = (p, n) => pitchCounts.set(p.id, (pitchCounts.get(p.id) || 0) + n);

  function maybeRelieve(team, currentPitcher, inning, isHomeSide) {
    const staminaAttr = currentPitcher.pitching ? currentPitcher.pitching.stamina : 50;
    const fatigueThreshold = 60 + staminaAttr * 0.6; // pitches before fatigue risk ramps up
    const count = pitchCounts.get(currentPitcher.id) || 0;
    if (inning < 5 || count < fatigueThreshold) return currentPitcher;
    const overBy = count - fatigueThreshold;
    const chance = clamp(overBy * 0.03, 0, 0.5);
    if (Math.random() > chance) return currentPitcher;
    const options = bullpenOptions(team, currentPitcher.id);
    if (!options.length) return currentPitcher;
    const reliever = pick(options.slice(0, Math.max(1, Math.ceil(options.length / 2))));
    pitchCounts.set(reliever.id, 0);
    if (recordLog) {
      const desc = describeSub("pitching", currentPitcher, reliever, `${count} pitches thrown`);
      game.subs.push({ inning, half: isHomeSide ? "bottom" : "top", kind: "pitching", team: isHomeSide ? "home" : "away", outPlayer: currentPitcher, inPlayer: reliever, note: `${count} pitches thrown`, description: desc });
    }
    return reliever;
  }

  let homeIdx = 0, awayIdx = 0;
  const maxInnings = 9;
  for (let inning = 1; inning <= maxInnings || game.score.home === game.score.away; inning++) {
    // Away bats top, Home bats bottom. Pitching changes are checked at the
    // top of each half based on fatigue accrued so far.
    homePitcher = maybeRelieve(homeTeam, homePitcher, inning, true);
    game.outs.away = 0; game.bases.away = [null, null, null];
    const topPlays = [];
    let topRunsBefore = game.score.away;
    while (game.outs.away < 3 && awayLineup.length) {
      const batter = awayLineup[awayIdx % awayLineup.length]; awayIdx++;
      const pitchSeq = [];
      const res = simPlateAppearance(batter, homePitcher, (pi) => pitchSeq.push(pi));
      bumpPitchCount(homePitcher, pitchSeq.length);
      const runs = applyPAResult(game, "away", batter, homePitcher, res.result, inning);
      if (recordLog) {
        topPlays.push(describePAResult(batter, res.result, runs, game.outs.away));
        game.pitchLog.push({
          inning, half: "top", battingTeam: "away", batter, pitcher: homePitcher,
          pitches: pitchSeq, result: res.result, runsScored: runs,
          basesAfter: [...game.bases.away], outsAfter: game.outs.away,
          scoreAfter: { home: game.score.home, away: game.score.away }
        });
      }
    }
    if (recordLog) game.log.push({
      inning, half: "top", plays: topPlays,
      runsThisHalf: game.score.away - topRunsBefore,
      scoreAfter: { home: game.score.home, away: game.score.away }
    });

    if (inning >= maxInnings && game.score.home > game.score.away) break;

    awayPitcher = maybeRelieve(awayTeam, awayPitcher, inning, false);
    game.outs.home = 0; game.bases.home = [null, null, null];
    const bottomPlays = [];
    let bottomRunsBefore = game.score.home;
    while (game.outs.home < 3 && homeLineup.length) {
      const batter = homeLineup[homeIdx % homeLineup.length]; homeIdx++;
      const pitchSeq = [];
      const res = simPlateAppearance(batter, awayPitcher, (pi) => pitchSeq.push(pi));
      bumpPitchCount(awayPitcher, pitchSeq.length);
      const runs = applyPAResult(game, "home", batter, awayPitcher, res.result, inning);
      if (recordLog) {
        bottomPlays.push(describePAResult(batter, res.result, runs, game.outs.home));
        game.pitchLog.push({
          inning, half: "bottom", battingTeam: "home", batter, pitcher: awayPitcher,
          pitches: pitchSeq, result: res.result, runsScored: runs,
          basesAfter: [...game.bases.home], outsAfter: game.outs.home,
          scoreAfter: { home: game.score.home, away: game.score.away }
        });
      }
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

  // Finalize pitcher outs. If we recorded a pitch-level log, credit outs
  // based on who actually appeared for each side (splitting evenly across
  // any mid-game relief); otherwise (fast-sim path) credit the full game
  // to whichever starter got a line, matching prior simplified behavior.
  if (recordLog && game.pitchLog.length) {
    for (const side of ["away", "home"]) {
      const half = side === "away" ? "top" : "bottom";
      const ids = [...new Set(game.pitchLog.filter(x => x.half === half).map(x => x.pitcher.id))];
      if (!ids.length) continue;
      const share = Math.floor(27 / ids.length);
      ids.forEach((id, i) => {
        if (game.pitcherLines.has(id)) game.pitcherLines.get(id).outs = (i === ids.length - 1) ? (27 - share * (ids.length - 1)) : share;
      });
    }
  } else {
    if (game.pitcherLines.has(homeStartingPitcher.id)) game.pitcherLines.get(homeStartingPitcher.id).outs = 27;
    if (game.pitcherLines.has(awayStartingPitcher.id)) game.pitcherLines.get(awayStartingPitcher.id).outs = 27;
  }

  const winner = game.score.home >= game.score.away ? homeTeam : awayTeam;
  const loser = winner === homeTeam ? awayTeam : homeTeam;
  return {
    game, homeTeam, awayTeam, homeScore: game.score.home, awayScore: game.score.away, winner, loser,
    winningPitcher: winner === homeTeam ? homeStartingPitcher : awayStartingPitcher,
    losingPitcher: loser === homeTeam ? homeStartingPitcher : awayStartingPitcher,
    homeLineup: homeLineupInfo, awayLineup: awayLineupInfo,
    homeStartingPitcher, awayStartingPitcher
  };
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
    if (p.isUser) trackUserPlayingTime(p, true);
  }
  for (const line of result.game.pitcherLines.values()) {
    const p = line.player;
    const s = p.seasonStats.pitching;
    s.G++;
    if (p === result.winningPitcher) s.W++;
    if (p === result.losingPitcher) s.L++;
    s.IP += line.outs / 3;
    s.H += line.H; s.ER += line.ER; s.BB += line.BB; s.SO += line.SO;
    if (p.isUser) trackUserPlayingTime(p, true);
  }
}

// Records the user player's playing-time history (games on an active
// roster vs. games actually appeared in, and a running bench streak).
// This is the data the future "not getting enough playing time -> ask for
// a trade / accept free agency / go to the farm league" flow will read
// from; Phase 1 just tracks it faithfully.
function trackUserPlayingTime(p, appeared) {
  if (!p.playingTime) p.playingTime = { gamesOnRoster: 0, gamesAppeared: 0, benchStreak: 0 };
  p.playingTime.gamesOnRoster++;
  if (appeared) { p.playingTime.gamesAppeared++; p.playingTime.benchStreak = 0; }
  else { p.playingTime.benchStreak++; }
}

// Called from the schedule loop (which knows team ids) for the case where
// the user has a team today but did NOT appear in the box score — i.e.
// they were benched by their coach.
function trackBenchedIfApplicable(state, result) {
  const p = state.player;
  if (!p || p.retired) return;
  const userTeamId = p.teamId || p.orgId;
  const onThisGame = userTeamId && (result.homeTeam.id === userTeamId || result.awayTeam.id === userTeamId);
  if (!onThisGame) return;
  const appeared = result.game.lines.has(p.id) || result.game.pitcherLines.has(p.id);
  if (!appeared) trackUserPlayingTime(p, false);
}
