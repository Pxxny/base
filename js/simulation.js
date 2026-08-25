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
function simPlateAppearance(batter, pitcher, onPitch, matchup = null) {
  const bOv = isPitcher(batter.position) ? 40 : battingOverall(batter);
  const pOv = pitcher ? pitchingOverall(pitcher) : 50;
  const b = batter.batting;
  const rivalryClutch = matchup && matchup.batterId === batter.id ? (matchup.clutch || 0) : 0;
  const diff = bOv - pOv + rivalryClutch * 0.35; // positive favors batter

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
  if (pitcher) {
    const key = `${batter.id}:${pitcher.id}`;
    if (!game.matchupLines.has(key)) game.matchupLines.set(key, { batterId: batter.id, pitcherId: pitcher.id, AB: 0, H: 0, SO: 0, BB: 0 });
    const ml = game.matchupLines.get(key);
    if (result !== "BB") ml.AB++;
    if (["1B","2B","3B","HR"].includes(result)) ml.H++;
    if (result === "SO") ml.SO++;
    if (result === "BB") ml.BB++;
  }
  stats.PA++;
  if (pstats) pstats.BF = (pstats.BF || 0) + 1;

  // scorers collects the actual runner (player object) for each run scored
  // during this plate appearance, in the order they crossed the plate, so
  // callers can credit each one's box-score R individually rather than
  // just incrementing a bare counter.
  const scorers = [];
  const advanceRunners = (bases, numAdvance, scoreOnHome = true) => {
    let runsScored = 0;
    for (let i = 3; i >= 0; i--) {
      if (bases[i]) {
        const newBase = i + numAdvance;
        if (newBase >= 3) { runsScored++; scorers.push(bases[i]); bases[i] = null; }
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
      if (pstats) pstats.outs++;
      break;
    case "BB":
      stats.BB++;
      if (pstats) pstats.BB++;
      // force advance only where needed
      if (bases[0]) {
        if (bases[1]) {
          if (bases[2]) { runs++; scorers.push(bases[2]); }
          bases[2] = bases[1];
        }
        bases[1] = bases[0];
      }
      bases[0] = batter;
      break;
    case "OUT":
      stats.AB++;
      game.outs[battingTeamKey]++;
      if (pstats) pstats.outs++;
      // occasionally advance a runner (sac-like), simplified: 15% chance runner on 3rd scores
      if (bases[2] && Math.random() < 0.35 && game.outs[battingTeamKey] <= 2) {
        runs++; scorers.push(bases[2]); bases[2] = null;
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
      scorers.push(batter);
      stats.RBI += runs;
      break;
  }
  if (result !== "HR" && runs > 0) stats.RBI += runs;
  if (pstats && runs > 0) pstats.ER = (pstats.ER || 0) + runs;
  game.score[battingTeamKey] += runs;
  // Credit each actual scorer's box-score line, so the final box score can
  // report who scored the runs — not just how many runs were scored.
  for (const scorer of scorers) {
    const scorerStats = game.playerLine(scorer);
    scorerStats.R = (scorerStats.R || 0) + 1;
  }
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
    lob: { home: 0, away: 0 },
    lines: new Map(),
    pitcherLines: new Map(),
    pitcherUsage: new Map(),
    matchupLines: new Map(),
    log: [],
    pitchLog: [],
    subs: [],
    playerLine(p) {
      if (!this.lines.has(p.id)) this.lines.set(p.id, { player: p, PA: 0, AB: 0, H: 0, "1B": 0, "2B": 0, "3B": 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0 });
      return this.lines.get(p.id);
    },
    pitcherLine(p) {
      if (!this.pitcherLines.has(p.id)) {
        this.pitcherLines.set(p.id, {
          player: p, outs: 0, H: 0, ER: 0, BB: 0, SO: 0, BF: 0,
          W: 0, L: 0, SV: 0, HLD: 0
        });
      }
      return this.pitcherLines.get(p.id);
    }
  };

  const homeLineupInfo = buildLineup(homeTeam);
  const awayLineupInfo = buildLineup(awayTeam);
  const homeLineup = homeLineupInfo.order.map(o => o.player);
  const awayLineup = awayLineupInfo.order.map(o => o.player);

  // Realistic pitcher roles. Older saves may not have bullpenRole, so infer it
  // from the existing SP/RP/CP position field.
  const roleOf = (p) => {
    if (!p) return "Middle Relief";
    if (p.position === "SP") return "Starter";
    if (p.position === "CP") return "Closer";
    return p.bullpenRole || p.role || "Middle Relief";
  };
  const bullpenOptionsBySituation = (team, currentPitcher, inning, isHomeSide) => {
    const own = isHomeSide ? game.score.home : game.score.away;
    const opp = isHomeSide ? game.score.away : game.score.home;
    const diff = own - opp;
    const opts = bullpenOptions(team, currentPitcher.id).filter(p => p.health.status === "Healthy");
    if (!opts.length) return [];

    let preferredRoles = [];
    if (inning >= 9 && diff > 0 && diff <= 3) preferredRoles = ["Closer", "Setup", "Middle Relief"];
    else if (inning >= 7 && diff > 0 && diff <= 3) preferredRoles = ["Setup", "Closer", "Middle Relief"];
    else if (inning >= 7 && diff === 0) preferredRoles = ["Setup", "Closer", "Middle Relief"];
    else if (inning >= 6 && diff < 0) preferredRoles = ["Setup", "Closer", "Middle Relief"];
    else preferredRoles = ["Middle Relief", "Setup", "Closer"];

    const roleRank = p => preferredRoles.indexOf(roleOf(p));
    return opts.sort((a, b) => {
      const rr = roleRank(a) - roleRank(b);
      if (rr) return rr;
      return pitchingOverall(b) - pitchingOverall(a);
    });
  };

  let homePitcher = pickStartingPitcher(homeTeam);
  let awayPitcher = pickStartingPitcher(awayTeam);
  const homeStartingPitcher = homePitcher;
  const awayStartingPitcher = awayPitcher;
  const matchupFor = (batter, pitchingTeam) => {
    if (!opts.rivalry) return null;
    const pitcherEffect = opts.rivalry.pitcherEffects?.[pitchingTeam === homeTeam ? (homePitcher?.id) : (awayPitcher?.id)] || 0;
    return { ...opts.rivalry, batterId: batter.id, clutch: (opts.rivalry.clutch || 0) + pitcherEffect };
  };
  const pitchCounts = new Map();
  const bumpPitchCount = (p, n) => pitchCounts.set(p.id, (pitchCounts.get(p.id) || 0) + n);

  function registerAppearance(p, teamKey, inning, half) {
    if (!game.pitcherUsage.has(p.id)) {
      game.pitcherUsage.set(p.id, {
        player: p, team: teamKey, role: roleOf(p), firstInning: inning,
        lastInning: inning, half, started: p.id === (teamKey === "home" ? homeStartingPitcher.id : awayStartingPitcher.id),
        enteredWithLead: false, enteredScoreDiff: 0, saveSituation: false,
        finished: false
      });
    }
    const u = game.pitcherUsage.get(p.id);
    u.lastInning = inning;
    u.half = half;
    if (u.firstInning === inning && u.firstHalf === undefined) u.firstHalf = half;
    const isHome = teamKey === "home";
    if (u.firstInning === inning && u._entryRecorded !== true) {
      u.enteredScoreDiff = isHome ? game.score.home - game.score.away : game.score.away - game.score.home;
      u.enteredWithLead = u.enteredScoreDiff > 0;
      u._entryRecorded = true;
    }
    return u;
  }

  function isSaveSituation(isHomeSide, inning, diff) {
    // MLB save situation: pitcher is the finishing pitcher, team is ahead,
    // tying run is on deck/base/plate, or the lead is <=3, or the pitcher
    // works 3+ innings. We use the score/inning state here; the 3+ IP case
    // is finalized from actual outs below.
    return diff > 0 && (diff <= 3 || inning >= 7);
  }

  function shouldReplace(team, currentPitcher, inning, isHomeSide) {
    const count = pitchCounts.get(currentPitcher.id) || 0;
    const pLine = game.pitcherLine(currentPitcher);
    const ip = pLine.outs / 3;
    const role = roleOf(currentPitcher);
    const own = isHomeSide ? game.score.home : game.score.away;
    const opp = isHomeSide ? game.score.away : game.score.home;
    const diff = own - opp;

    // Starters are normally allowed to work through the first five.
    if (role === "Starter") {
      if (inning < 5) return false;
      const stamina = currentPitcher.pitching ? currentPitcher.pitching.stamina : 50;
      const threshold = 82 + stamina * 0.35;
      if (count >= threshold) return true;
      // Late-game leverage: don't automatically remove a good starter, but
      // strongly favor the bullpen after six when the pitch count is high.
      if (inning >= 7 && count >= 78) return true;
      if (inning >= 6 && count >= 92) return true;
      // A starter who has been hit hard is more likely to be removed.
      if (ip >= 4 && pLine.ER >= 4) return true;
      return false;
    }

    // Relievers normally get at least one inning unless the game is in a
    // critical spot or they have clearly reached a pitch/fatigue limit.
    if (inning <= 5 && count < 28) return false;
    if (inning >= 9 && role === "Closer" && diff > 0 && diff <= 3) return false;
    if (count >= 28) return true;
    if (inning >= 8 && role === "Middle Relief" && diff > 0 && count >= 12) return true;
    if (inning >= 8 && role === "Setup" && diff > 0 && diff <= 3 && count >= 20) return true;
    return false;
  }

  function maybeRelieve(team, currentPitcher, inning, isHomeSide, forceLate = false) {
    if (!currentPitcher) return currentPitcher;
    if (!forceLate && !shouldReplace(team, currentPitcher, inning, isHomeSide)) return currentPitcher;
    const options = bullpenOptionsBySituation(team, currentPitcher, inning, isHomeSide);
    if (!options.length) return currentPitcher;

    // Avoid repeatedly swapping fresh relievers just because the inning is
    // late. The closer is normally reserved for a save situation.
    const own = isHomeSide ? game.score.home : game.score.away;
    const opp = isHomeSide ? game.score.away : game.score.home;
    const diff = own - opp;
    const candidate = options.find(p => {
      const r = roleOf(p);
      if (r === "Closer") return inning >= 8 && diff > 0 && diff <= 3;
      return true;
    }) || options[0];

    if (candidate.id === currentPitcher.id) return currentPitcher;
    pitchCounts.set(candidate.id, 0);
    registerAppearance(candidate, isHomeSide ? "home" : "away", inning, isHomeSide ? "bottom" : "top");

    if (recordLog) {
      const count = pitchCounts.get(currentPitcher.id) || 0;
      const note = `${roleOf(currentPitcher)} -> ${roleOf(candidate)}`;
      const desc = describeSub("pitching", currentPitcher, candidate, note);
      game.subs.push({
        inning, half: isHomeSide ? "bottom" : "top", kind: "pitching",
        team: isHomeSide ? "home" : "away",
        outPlayer: currentPitcher, inPlayer: candidate, note, description: desc
      });
    }
    return candidate;
  }

  let homeIdx = 0, awayIdx = 0;
  let inning = 1;
  const maxInnings = 9;

  // Register starters before the first pitch and mark their actual start.
  registerAppearance(homePitcher, "home", 1, "bottom");
  registerAppearance(awayPitcher, "away", 1, "top");

  while (inning <= maxInnings || game.score.home === game.score.away) {
    // Top: away bats, home pitches.
    homePitcher = maybeRelieve(homeTeam, homePitcher, inning, true);
    game.outs.away = 0; game.bases.away = [null, null, null];
    const topPlays = [];
    const topRunsBefore = game.score.away;
    let topHits = 0;

    while (game.outs.away < 3 && awayLineup.length) {
      // Late-game bullpen management can happen after a plate appearance,
      // not just between innings, which is common when a reliever gets into
      // trouble with the heart of the order.
      if (game.outs.away > 0 && inning >= 7 && shouldReplace(homeTeam, homePitcher, inning, true)) {
        homePitcher = maybeRelieve(homeTeam, homePitcher, inning, true, true);
      }

      registerAppearance(homePitcher, "home", inning, "top");
      const batter = awayLineup[awayIdx % awayLineup.length]; awayIdx++;
      const pitchSeq = [];
      const res = simPlateAppearance(batter, homePitcher, pi => pitchSeq.push(pi), matchupFor(batter, homeTeam));
      bumpPitchCount(homePitcher, pitchSeq.length);
      const runs = applyPAResult(game, "away", batter, homePitcher, res.result, inning);
      if (["1B", "2B", "3B", "HR"].includes(res.result)) topHits++;

      if (recordLog) {
        topPlays.push(describePAResult(batter, res.result, runs, game.outs.away));
        game.pitchLog.push({
          inning, half: "top", battingTeam: "away", batter, pitcher: homePitcher,
          pitches: pitchSeq, result: res.result, runsScored: runs,
          basesAfter: [...game.bases.away], outsAfter: game.outs.away,
          scoreAfter: { home: game.score.home, away: game.score.away }
        });
      }

      // A fresh high-leverage arm can enter after a crooked inning or when
      // the tying/go-ahead run appears, rather than waiting for three outs.
      if (game.outs.away < 3 && inning >= 7 && shouldReplace(homeTeam, homePitcher, inning, true)) {
        const before = homePitcher;
        homePitcher = maybeRelieve(homeTeam, homePitcher, inning, true, true);
        if (homePitcher === before) { /* stay with the current arm */ }
      }
    }
    game.lob.away += game.bases.away.filter(Boolean).length;
    if (recordLog) game.log.push({
      inning, half: "top", plays: topPlays,
      runsThisHalf: game.score.away - topRunsBefore, hitsThisHalf: topHits,
      scoreAfter: { home: game.score.home, away: game.score.away }
    });

    if (inning >= maxInnings && game.score.home > game.score.away) break;

    // Bottom: home bats, away pitches.
    awayPitcher = maybeRelieve(awayTeam, awayPitcher, inning, false);
    game.outs.home = 0; game.bases.home = [null, null, null];
    const bottomPlays = [];
    const bottomRunsBefore = game.score.home;
    let bottomHits = 0;

    while (game.outs.home < 3 && homeLineup.length) {
      if (game.outs.home > 0 && inning >= 7 && shouldReplace(awayTeam, awayPitcher, inning, false)) {
        awayPitcher = maybeRelieve(awayTeam, awayPitcher, inning, false, true);
      }

      registerAppearance(awayPitcher, "away", inning, "bottom");
      const batter = homeLineup[homeIdx % homeLineup.length]; homeIdx++;
      const pitchSeq = [];
      const res = simPlateAppearance(batter, awayPitcher, pi => pitchSeq.push(pi), matchupFor(batter, awayTeam));
      bumpPitchCount(awayPitcher, pitchSeq.length);
      const runs = applyPAResult(game, "home", batter, awayPitcher, res.result, inning);
      if (["1B", "2B", "3B", "HR"].includes(res.result)) bottomHits++;

      if (recordLog) {
        bottomPlays.push(describePAResult(batter, res.result, runs, game.outs.home));
        game.pitchLog.push({
          inning, half: "bottom", battingTeam: "home", batter, pitcher: awayPitcher,
          pitches: pitchSeq, result: res.result, runsScored: runs,
          basesAfter: [...game.bases.home], outsAfter: game.outs.home,
          scoreAfter: { home: game.score.home, away: game.score.away }
        });
      }

      if (inning >= maxInnings && game.score.home > game.score.away) break;

      if (game.outs.home < 3 && inning >= 7 && shouldReplace(awayTeam, awayPitcher, inning, false)) {
        const before = awayPitcher;
        awayPitcher = maybeRelieve(awayTeam, awayPitcher, inning, false, true);
        if (awayPitcher === before) { /* stay with the current arm */ }
      }
    }

    game.lob.home += game.bases.home.filter(Boolean).length;
    if (recordLog) game.log.push({
      inning, half: "bottom", plays: bottomPlays,
      runsThisHalf: game.score.home - bottomRunsBefore, hitsThisHalf: bottomHits,
      scoreAfter: { home: game.score.home, away: game.score.away }
    });

    if (inning >= maxInnings + 15) break;
    inning++;
  }

  // Actual innings pitched are derived from actual outs recorded in
  // applyPAResult. No artificial 27-out split is used.
  const winner = game.score.home > game.score.away ? homeTeam : awayTeam;
  const loser = winner === homeTeam ? awayTeam : homeTeam;
  finalizePitchingDecisions(game, winner, loser, homeTeam, awayTeam);

  const winningPitcher = [...game.pitcherLines.values()].find(x => x.W)?.player || homeStartingPitcher;
  const losingPitcher = [...game.pitcherLines.values()].find(x => x.L)?.player || awayStartingPitcher;

  return {
    game, homeTeam, awayTeam, homeScore: game.score.home, awayScore: game.score.away,
    winner, loser, winningPitcher, losingPitcher,
    homeLineup: homeLineupInfo, awayLineup: awayLineupInfo,
    homeStartingPitcher, awayStartingPitcher
  };
}

// Finalize MLB-style pitching decisions from the pitchers who actually
// appeared. The implementation follows the important official concepts:
// a starter normally needs 5 IP for a win; the losing pitcher is charged
// with the go-ahead run; a save belongs to the finishing reliever in a save
// situation; a hold belongs to a reliever who leaves with the lead intact.
function finalizePitchingDecisions(game, winner, loser, homeTeam, awayTeam) {
  const sideForTeam = team => team === homeTeam ? "home" : "away";
  const winnerSide = sideForTeam(winner);
  const loserSide = sideForTeam(loser);
  const ordered = [...game.pitcherLines.values()];
  if (!ordered.length) return;

  // Determine the winning pitcher. If the starter completed >=5 IP, he gets
  // the win when his team never surrendered the final lead. Otherwise use
  // the most effective reliever who was on the mound when the team took its
  // final lead, with a conservative fallback to the last winning pitcher.
  const winCandidates = ordered.filter(l => {
    const u = game.pitcherUsage.get(l.player.id);
    return u && u.team === winnerSide;
  });
  const finalLead = winner === homeTeam
    ? game.score.home - game.score.away
    : game.score.away - game.score.home;

  // Use the game's actual starting pitcher references instead of relying on
  // team objects that may not expose a starter field.
  const winningStarter = winner === homeTeam ? [...ordered].find(l => l.player.id === [...game.pitcherUsage.values()].find(u => u.team === "home" && u.started)?.player.id) :
    [...ordered].find(l => l.player.id === [...game.pitcherUsage.values()].find(u => u.team === "away" && u.started)?.player.id);
  let winLine = null;

  if (winningStarter && winningStarter.outs >= 15) winLine = winningStarter;
  if (!winLine) {
    const winnerAppearances = winCandidates.sort((a, b) => {
      const au = game.pitcherUsage.get(a.player.id), bu = game.pitcherUsage.get(b.player.id);
      const as = (a.SO * 2) + a.outs - a.ER * 2;
      const bs = (b.SO * 2) + b.outs - b.ER * 2;
      return bs - as;
    });
    winLine = winnerAppearances[0] || null;
  }
  if (winLine) winLine.W = 1;

  // Find the pitcher responsible for the losing team's decisive deficit:
  // walk through scoring states and keep the pitcher who was on the mound
  // when the winning team first established the final winning margin.
  const losingCandidates = ordered.filter(l => game.pitcherUsage.get(l.player.id)?.team === loserSide);
  let lossLine = losingCandidates[losingCandidates.length - 1] || null;
  let prevMargin = 0;
  let finalGoAheadPitch = null;
  for (const play of game.pitchLog) {
    const margin = play.scoreAfter[winnerSide] - play.scoreAfter[loserSide];
    if (margin > 0 && prevMargin <= 0) finalGoAheadPitch = play;
    if (margin <= 0) finalGoAheadPitch = null;
    prevMargin = margin;
  }
  if (finalGoAheadPitch) lossLine = game.pitcherLines.get(finalGoAheadPitch.pitcher.id) || lossLine;
  if (lossLine) lossLine.L = 1;

  // Save / hold logic is based on the finishing reliever and the score at
  // his entry. A reliever cannot receive both a win and a save.
  const finishers = [];
  const finalHalf = winnerSide === "home" ? "bottom" : "top";
  for (const line of ordered) {
    const u = game.pitcherUsage.get(line.player.id);
    if (!u || u.team !== winnerSide) continue;
    const teamIsStarter = u.started;
    const isReliever = !teamIsStarter;
    if (!isReliever) continue;

    const lastAppearancePitch = [...game.pitchLog].reverse().find(x => x.pitcher.id === line.player.id && x.half === finalHalf);
    const finished = lastAppearancePitch && (
      (winnerSide === "home" && lastAppearancePitch.outsAfter >= 3) ||
      (winnerSide === "away" && lastAppearancePitch.outsAfter >= 3) ||
      (lastAppearancePitch.inning >= 9 && game.score.home !== game.score.away && winnerSide === "home") ||
      (lastAppearancePitch.inning >= 9 && game.score.home !== game.score.away && winnerSide === "away")
    );
    if (finished || !finishers.length) finishers.push(line);
  }

  // The last winning reliever to appear is the finishing pitcher.
  const winningRelievers = ordered.filter(l => {
    const u = game.pitcherUsage.get(l.player.id);
    return u && u.team === winnerSide && !u.started;
  }).sort((a, b) => (game.pitcherUsage.get(a.player.id).firstInning - game.pitcherUsage.get(b.player.id).firstInning));
  const finisher = winningRelievers[winningRelievers.length - 1] || null;

  if (finisher && !finisher.W && !finisher.L) {
    const u = game.pitcherUsage.get(finisher.player.id);
    const entryPitch = game.pitchLog.find(x => x.pitcher.id === finisher.player.id);
    const entryInning = u ? u.firstInning : 99;
    const entryDiff = u ? u.enteredScoreDiff : finalLead;
    const saveEligible = finalLead > 0 && entryDiff > 0 && (
      entryDiff <= 3 ||
      entryInning >= 7 ||
      finisher.outs >= 9
    );
    if (saveEligible) finisher.SV = 1;
  }

  // Holds: a non-finishing reliever who enters in a save situation and
  // leaves with his team still ahead gets a hold, provided he did not get W/L.
  for (const line of winningRelievers) {
    if (line === finisher || line.W || line.L) continue;
    const u = game.pitcherUsage.get(line.player.id);
    if (!u) continue;
    const entryDiff = u.enteredScoreDiff;
    if (entryDiff > 0 && (entryDiff <= 3 || u.firstInning >= 7)) line.HLD = 1;
  }
}
// Picks the standout performer of a completed game from both teams' box
// score lines, batters and pitchers alike, using a simple weighted score
// (hits/power/RBI/runs for hitters, outs recorded/strikeouts/runs allowed
// for pitchers) so a dominant pitching outing can win it over a quiet
// batting line, and vice versa.
function pickPlayerOfTheGame(result) {
  let best = null, bestScore = -Infinity;

  for (const line of result.game.lines.values()) {
    const score = line.H * 1 + line["2B"] * 1 + line["3B"] * 2 + line.HR * 4
      + line.RBI * 1.5 + (line.R || 0) * 1 + line.BB * 0.3 - line.SO * 0.2;
    if (score > bestScore) { bestScore = score; best = { player: line.player, kind: "batting", line }; }
  }

  for (const line of result.game.pitcherLines.values()) {
    const ip = line.outs / 3;
    if (ip <= 0) continue;
    const win = line.player === result.winningPitcher ? 2 : 0;
    const score = ip * 1.4 + line.SO * 0.6 + win - line.ER * 1.8 - line.H * 0.3 - line.BB * 0.4;
    if (score > bestScore) { bestScore = score; best = { player: line.player, kind: "pitching", line }; }
  }

  return best;
}

// Builds a classic line-score (1-9+ innings, R/H/E totals) from game.log,
// for the box-score header shown on the live and final game-day screens.
// Errors aren't modeled by the simulation (every out is clean), so E is
// always reported as 0 rather than fabricating a stat the sim doesn't track.
function buildLineScore(game) {
  const innings = [...new Set(game.log.map(h => h.inning))].sort((a, b) => a - b);
  const away = innings.map(n => {
    const half = game.log.find(h => h.inning === n && h.half === "top");
    return half ? half.runsThisHalf : null; // null = didn't get here (e.g. game-ending walk-off skips bottom)
  });
  const home = innings.map(n => {
    const half = game.log.find(h => h.inning === n && h.half === "bottom");
    return half ? half.runsThisHalf : null;
  });
  const totalHits = (team) => game.log.filter(h => (team === "away" ? h.half === "top" : h.half === "bottom")).reduce((sum, h) => sum + (h.hitsThisHalf || 0), 0);
  return {
    innings,
    away: { byInning: away, R: game.score.away, H: totalHits("away"), E: 0 },
    home: { byInning: home, R: game.score.home, H: totalHits("home"), E: 0 }
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
    s.R += line.R || 0; // actual runs scored, tracked per-play in applyPAResult
    if (p.isUser) trackUserPlayingTime(p, true);
  }
  for (const line of result.game.pitcherLines.values()) {
    const p = line.player;
    const s = p.seasonStats.pitching;
    s.G++;
    if (line.W) s.W += line.W;
    if (line.L) s.L += line.L;
    if (line.SV) s.SV += line.SV;
    if (line.HLD) s.HLD = (s.HLD || 0) + line.HLD;
    const usage = result.game.pitcherUsage && result.game.pitcherUsage.get(p.id);
    if (usage && usage.started) s.GS = (s.GS || 0) + 1;
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
