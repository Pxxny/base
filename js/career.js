// ============================================================
// CAREER PROGRESSION
// ============================================================
// Aging/development, training, character creation, career start
// modes, game-state initialization, season rollover, and the
// screens that drive the career loop (creation -> mode select ->
// amateur/draft -> team select -> the main tabbed career hub).
// Depends on js/player.js, js/teams.js, js/leagues.js,
// js/injuries.js, js/news.js, js/statistics.js, js/contracts.js,
// js/simulation.js, js/schedule.js, and js/game.js (el/toast/
// renderAll/STATE/ACTIVE_TAB/CREATION/LAST_GAME_LOGS).

// ============================================================
// AGING / DEVELOPMENT
// ============================================================
function developPlayer(p) {
  if (p.retired) return;
  p.age++;
  const growthPhase = p.age <= 24 ? "growth" : p.age <= 29 ? "prime" : p.age <= 33 ? "plateau" : "decline";
  const potentialGap = p.potential - overallRating(p);
  const trendBonus = p.developmentTrend || 0;

  const applyDelta = (obj, keys, base) => {
    for (const k of keys) {
      let delta = base;
      if (growthPhase === "growth") delta += rnd(0, 3) + potentialGap * 0.02;
      else if (growthPhase === "prime") delta += rnd(-1, 2);
      else if (growthPhase === "plateau") delta += rnd(-2, 1);
      else delta += rnd(-4, 0);
      delta += trendBonus * 0.3;
      obj[k] = clamp(Math.round(obj[k] + delta), 15, 99);
    }
  };

  applyDelta(p.batting, Object.keys(p.batting), 0);
  applyDelta(p.fielding, Object.keys(p.fielding), 0);
  if (isPitcher(p.position)) applyDelta(p.pitching, Object.keys(p.pitching), 0);

  // speed always declines with age after 30
  if (p.age > 30) p.batting.speed = clamp(p.batting.speed - rnd(1, 3), 15, 99);

  if (p.age >= 40 && Math.random() < 0.25) p.retired = true;
  if (p.age >= 44) p.retired = true;
}

// ============================================================
// TRAINING
// ============================================================
const TRAINING_FOCI = {
  "Contact Training": { attrs: [["batting", "contact"]], gain: [1, 4] },
  "Power Training": { attrs: [["batting", "power"], ["batting", "gapPower"]], gain: [1, 3] },
  "Speed Training": { attrs: [["batting", "speed"]], gain: [1, 3] },
  "Fielding Training": { attrs: [["fielding", "fielding"], ["fielding", "range"]], gain: [1, 3] },
  "Pitching Training": { attrs: [["pitching", "control"], ["pitching", "movement"]], gain: [1, 3] },
  "Stamina Training": { attrs: [["pitching", "stamina"]], gain: [1, 4] },
  "Mental Training": { attrs: [["batting", "plateDiscipline"], ["batting", "clutch"]], gain: [1, 3] }
};

function runTraining(p, focusName) {
  const focus = TRAINING_FOCI[focusName];
  const log = { focus: focusName, events: [] };
  if (!focus) return log;

  // Injury risk
  if (Math.random() < 0.04) {
    injurePlayer(p);
    log.events.push(`${p.name} suffered an injury during training!`);
    return log;
  }
  // Breakthrough / regression chance
  const roll = Math.random();
  let mult = 1;
  if (roll < 0.08) { mult = 2.5; log.events.push(`Breakthrough! ${p.name} responded exceptionally well.`); }
  else if (roll > 0.94) { mult = -1; log.events.push(`${p.name} regressed slightly this session.`); }

  for (const [cat, key] of focus.attrs) {
    const gain = Math.round(rnd(focus.gain[0], focus.gain[1]) * mult);
    p[cat][key] = clamp(p[cat][key] + gain, 15, 99);
  }
  p.fatigue = clamp(p.fatigue + rnd(5, 15), 0, 100);
  if (!log.events.length) log.events.push(`${p.name} completed ${focusName}.`);
  return log;
}


// ============================================================
// GAME STATE
// ============================================================
function newGameState() {
  return {
    year: 2026,
    day: 1,
    phase: "creation", // creation -> pre-career -> season -> offseason
    startMode: null,
    player: null,
    teams: {}, // id -> team
    allTeams: [],
    schedule: [], // list of {home, away, played, result}
    scheduleIndex: 0,
    news: [],
    draftClass: [],
    freeAgents: [],
    saveSlot: null,
    seasonRecap: null,
    pendingContractDecision: false,
    contractOffers: null,
    rivalries: {},
    tradeOffers: [],
    waiverClaims: [],
    freeAgentPool: [],
    transactionLog: [],
    transactionState: { lastTradeDay: 0, lastWaiverDay: 0, lastFAActionDay: 0 },
    h2h: {}
  };
}

// Minor levels are worse rosters the lower they go, roughly mirroring
// LEAGUES[...].level * 15 + 15 used for MLB/NPB/KBO (level 5 -> 90).
const MINOR_LEVEL_ROSTER_STRENGTH = {
  "Triple-A": 65, "Double-A": 52, "High-A": 40, "Single-A": 30, "Rookie": 20
};

function initLeagueTeams(state) {
  const built = [];
  for (const t of ALL_PRO_TEAMS) {
    const team = initTeam(t);
    generateRosterForTeam(team, LEAGUES[t.league].level * 15 + 15);
    state.teams[team.id] = team;
    built.push(team);
  }
  for (const t of ALL_MINOR_TEAMS) {
    const team = initTeam(t);
    generateRosterForTeam(team, MINOR_LEVEL_ROSTER_STRENGTH[t.minorLevel]);
    state.teams[team.id] = team;
    built.push(team);
  }
  state.allTeams = built;
}
// Note: addNews() lives in js/news.js (loaded before this file).

// ============================================================
// CHARACTER CREATION
// ============================================================
function createUserPlayer(form) {
  const p = createPlayer({
    name: form.name,
    age: form.age,
    nationality: form.nationality,
    position: form.position,
    isUser: true,
    levelHint: 25
  });
  p.battingHand = form.battingHand || p.battingHand;
  p.throwingHand = form.throwingHand || p.throwingHand;
  p.height = form.height || p.height;
  p.weight = form.weight || p.weight;
  // User players start a bit more balanced/lower so growth feels earned
  return p;
}

// ============================================================
// CAREER START MODES
// ============================================================
// Mode A: High School (16-18) -> HS games -> college offers -> draft
// Mode B: College -> college season -> draft
// Mode C: Minor League -> start at Rookie/Single-A etc, climb
// Mode D: Straight to draft prep
// Mode E: Start directly in MLB/NPB/KBO

function beginCareer(state, mode) {
  state.startMode = mode;
  const p = state.player;
  switch (mode) {
    case "HS":
      p.level = "HS"; p.age = p.age || 17; state.phase = "hs-season";
      addNews(state, `${p.name} begins their journey in high school baseball.`);
      break;
    case "College":
      p.level = "College"; p.age = Math.max(p.age, 19); state.phase = "college-season";
      addNews(state, `${p.name} commits to college baseball, chasing a shot at the Draft.`);
      break;
    case "Minors": {
      p.age = Math.max(p.age, 18);
      const startLevel = startingMinorLevelForOVR(p);
      assignToMinorTeam(state, p, startLevel);
      p.contract = generateContract(p, startLevel, 1);
      state.phase = "season";
      addNews(state, `${p.name} signs on and reports to ${startLevel} ball${startLevel !== "Rookie" ? " — scouts liked what they saw" : ""}.`);
      break;
    }
    case "DraftPrep":
      p.level = "Draft Prospect"; state.phase = "draft-prep";
      addNews(state, `${p.name} enters the pre-Draft process as a top prospect to watch.`);
      break;
    case "Pro":
      state.phase = "team-select";
      addNews(state, `${p.name} is ready to begin a professional career immediately.`);
      break;
  }
}

// Where a new/drafted player reports to camp depends on how good they
// already are: an elite prospect can skip straight to Double-A or
// Triple-A instead of always grinding up from Rookie ball.
function startingMinorLevelForOVR(p) {
  const ov = overallRating(p);
  if (ov >= 70) return "Triple-A";
  if (ov >= 60) return "Double-A";
  if (ov >= 50) return "High-A";
  if (ov >= 40) return "Single-A";
  return "Rookie";
}

function assignToMinorTeam(state, p, minorLevel, orgId = null) {
  // Attach the player to a real minor-league affiliate roster (a full
  // team with its own league/schedule/box scores), owned by an MLB org's
  // farm system.
  const org = orgId ? MLB_TEAMS.find(t => t.id === orgId) : pick(MLB_TEAMS);
  const chosenOrg = org || pick(MLB_TEAMS);
  p.orgId = chosenOrg.id;
  p.level = minorLevel;
  const teamId = affiliateTeamId(chosenOrg.id, minorLevel);
  p.teamId = teamId;
  const team = state.teams[teamId];
  if (team && !team.roster.find(r => r.id === p.id)) team.roster.push(p);
}

// Removes the player from whatever roster they're currently on (used
// when moving between minor-league levels or being called up), so they
// don't linger on two rosters at once.
function removeFromCurrentRoster(state, p) {
  if (!p.teamId) return;
  const team = state.teams[p.teamId];
  if (team) team.roster = team.roster.filter(r => r.id !== p.id);
}


// ============================================================
// SEASON LENGTH / SIM SEASON
// ============================================================
// How many days make up a season for whatever level the player's
// current team plays at (majors use LEAGUES[...].regularSeasonGames,
// minor-league levels use the shorter MINOR_LEVEL_GAMES table). Used so
// "Sim Season" knows how many more days to fast-forward through instead
// of just skipping straight to the offseason.
function seasonLengthDaysForPlayer(p) {
  if (!p) return 162;
  if (MINOR_LEVELS.includes(p.level)) return MINOR_LEVEL_GAMES[p.level] || 130;
  return (LEAGUES[p.level] && LEAGUES[p.level].regularSeasonGames) || 150;
}

// Picks a sensible auto-training focus for a day the user has no game
// (off day, or benched) so time doesn't just pass with nothing
// happening to their own development. Rotates across a player's
// relevant attribute categories and skips training if they're too
// fatigued, favoring recovery instead.
function autoTrainingFocusFor(p) {
  const pitcherFoci = ["Pitching Training", "Stamina Training", "Mental Training"];
  const batterFoci = ["Contact Training", "Power Training", "Speed Training", "Fielding Training", "Mental Training"];
  const foci = isPitcher(p.position) ? pitcherFoci : batterFoci;
  return pick(foci);
}

function autoTrainUserForDay(state) {
  const p = state.player;
  if (!p || p.retired || p.health.status !== "Healthy") return null;
  if ((p.fatigue || 0) >= 85) return null; // too gassed - rest instead of training
  const focus = autoTrainingFocusFor(p);
  return runTraining(p, focus);
}

// If the user is buried in the minors while the parent org's starter at
// their own position (or, for a pitcher, anywhere in the MLB rotation)
// is hurt, the org will call the user up to fill the injury gap — this
// is a team decision, not something gated by the coach-trust/cooldown
// rules that apply to a user-initiated request.
function maybeInjuryCallUp(state) {
  const p = state.player;
  if (!p || p.retired || !MINOR_LEVELS.includes(p.level) || !p.orgId) return null;
  const org = ALL_PRO_TEAMS.find(t => t.id === p.orgId);
  if (!org) return null;
  const parentTeam = state.teams[org.id];
  if (!parentTeam) return null;

  const injuredMatch = isPitcher(p.position)
    ? parentTeam.roster.some(r => r.position === "SP" && r.health.status === "Injured")
    : parentTeam.roster.some(r => r.position === p.position && r.health.status === "Injured");
  if (!injuredMatch) return null;

  // Only pull the trigger sometimes per day it's true, so it doesn't
  // fire the instant an injury happens every single time.
  if (Math.random() > 0.35) return null;

  removeFromCurrentRoster(state, p);
  p.level = org.league;
  p.teamId = org.id;
  parentTeam.roster.push(p);
  p.contract = generateContract(p, p.level, 2);
  addNews(state, `INJURY CALL-UP! ${p.name} is called up to the big leagues with the ${TEAM_NAME(org.id)} to cover an injury.`);
  toast(`${p.name} called up to ${p.level} to cover an injury!`);
  return true;
}

// Fast-forwards through the rest of the current season, day by day,
// instead of jumping straight to the offseason: every remaining game
// gets simulated (so nothing is skipped), a day with no game for the
// user runs an automatic training session, and an injury elsewhere on
// the parent org's roster can trigger a call-up along the way.
function simSeason(state) {
  const targetDays = seasonLengthDaysForPlayer(state.player);
  const results = [];
  let daysRun = 0;
  const maxDays = 400; // safety valve
  while (state.day < targetDays && daysRun < maxDays) {
    const userTeamId = state.player ? (state.player.teamId || state.player.orgId) : null;
    const { results: dayResults, userGameResult } = simDayWithUserGame(state);
    results.push(...dayResults);
    checkPromotion();
    maybeInjuryCallUp(state);
    if (state.player && !state.player.retired && userTeamId && !userGameResult) {
      // The user's team either didn't play today or they were benched -
      // either way, put the downtime to use.
      autoTrainUserForDay(state);
    }
    daysRun++;
  }
  return results;
}

// True once the season has run its full schedule length for the
// player's current level. Used by every day-advancing action so the
// calendar can never drift past the season's actual length.
function isSeasonComplete(state) {
  return state.day >= seasonLengthDaysForPlayer(state.player);
}

// Call this after ANY day-advancing action (Play Today's Game, Sim
// Day/Week/Month/Season). If the season has played out its full
// schedule, it snapshots the season's stat line for the recap screen,
// runs the full end-of-season rollover (aging, career stat totals,
// contract countdown for every player), and routes the UI to the
// season-summary screen - and from there to a contract-decision screen
// if the user's own deal just ran out. Returns true if a season just
// ended (callers use this to skip anything that assumed play continues
// today, like opening the Game Day tab).
function maybeEndSeason(state) {
  if (!isSeasonComplete(state)) return false;
  const p = state.player;
  state.seasonRecap = p ? {
    year: state.year,
    level: p.level,
    teamId: p.teamId,
    isPitcher: isPitcher(p.position),
    batting: { ...p.seasonStats.batting },
    pitching: { ...p.seasonStats.pitching },
    gamesPlayed: (isPitcher(p.position) ? p.seasonStats.pitching.G : p.seasonStats.batting.G) || 0
  } : null;
  const contractExpiring = !!(p && !p.retired && p.contract && p.contract.years <= 1);
  endSeasonRollover(state);
  state.pendingContractDecision = contractExpiring;
  state.phase = "season-summary";
  return true;
}

// ============================================================
// SEASON ROLLOVER / OFFSEASON
// ============================================================
function endSeasonRollover(state) {
  // Age and develop every player in every org, plus user
  for (const t of state.allTeams) {
    for (const p of t.roster) {
      developPlayer(p);
      finalizeSeasonToCareer(p);
      advanceContractYear(state, p);
    }
    t.roster = t.roster.filter(p => !p.retired);
    // Backfill roster with rookies if needed
    if (t.roster.length < 26) generateRosterForTeam(t, LEAGUES[t.league].level * 15 + 15);
    t.wins = 0; t.losses = 0;
  }
  if (state.player && !state.player.retired) {
    developPlayer(state.player);
    finalizeSeasonToCareer(state.player);
    // The user's own contract is counted down here too, but never
    // auto-renewed like an AI teammate's - an expired deal is left at
    // 0 years so the season-summary/contract-decision screens can hand
    // the choice of what's next to the player instead.
    if (state.player.contract) state.player.contract.years = Math.max(0, state.player.contract.years - 1);
  }
  state.year++;
  state.day = 1;
  addNews(state, `The ${state.year - 1} season has concluded. Welcome to ${state.year}.`);
}

// Ages a non-user player's contract by one year and auto re-signs them
// at the same level/pay scale on expiry, so AI-controlled rosters never
// end up with contract-less players sitting around.
function advanceContractYear(state, p) {
  if (p.isUser || !p.contract) return;
  p.contract.years = Math.max(0, p.contract.years - 1);
  if (p.contract.years <= 0) p.contract = generateContract(p, p.level, rnd(1, 3));
}

function finalizeSeasonToCareer(p) {
  const bs = p.seasonStats.batting, ps = p.seasonStats.pitching;
  p.seasonHistory.push({
    year: null, level: p.level, team: p.teamId,
    batting: { ...bs }, pitching: { ...ps }
  });
  for (const k of Object.keys(bs)) p.careerStats.batting[k] += bs[k];
  for (const k of Object.keys(ps)) p.careerStats.pitching[k] += ps[k];
  p.seasonStats = emptySeasonStats();
}

// ============================================================
// CONTRACT DECISION (offseason, when the user's deal expires)
// ============================================================
// Builds the offers shown on the contract-decision screen: a re-sign
// offer from the current team plus a few outside offers from other
// teams at the same pro level, all scaled by the player's current
// form/overall rating - and, since a move to Korea is always something
// a free agent can explore, a standing KBO offer whenever the player
// isn't already there. Minor leaguers get a simpler "stay put" offer
// instead, since level changes for them are handled by the up/down
// buttons rather than competing team offers.
function generateContractOffers(state, p) {
  if (!p) return [];
  const offers = [];
  const ov = overallRating(p);
  const formMult = clamp(0.7 + (ov - 50) * 0.01, 0.5, 1.6);

  if (!MINOR_LEVELS.includes(p.level)) {
    const currentTeam = p.teamId ? state.teams[p.teamId] : null;
    if (currentTeam) {
      offers.push({
        teamId: currentTeam.id, level: p.level, kind: "sign",
        salary: Math.round(estimateSalary(p, p.level) * formMult * (rnd(95, 115) / 100) * 100) / 100,
        years: rnd(1, 4), label: `Re-sign with ${TEAM_NAME(currentTeam.id)}`
      });
    }
    const others = ALL_PRO_TEAMS.filter(t => t.league === p.level && t.id !== p.teamId);
    for (const t of [...others].sort(() => Math.random() - 0.5).slice(0, 3)) {
      offers.push({
        teamId: t.id, level: p.level, kind: "sign",
        salary: Math.round(estimateSalary(p, p.level) * formMult * (rnd(85, 120) / 100) * 100) / 100,
        years: rnd(1, 4), label: `Sign with ${t.name}`
      });
    }
    if (p.level !== "KBO") {
      const kboTeam = pick(KBO_TEAMS);
      offers.push({
        teamId: kboTeam.id, level: "KBO", kind: "sign",
        salary: Math.round(estimateSalary(p, "KBO") * formMult * (rnd(90, 120) / 100) * 100) / 100,
        years: rnd(1, 3), label: `Move to Korea — sign with ${kboTeam.name} (KBO)`
      });
    }
  } else if (p.teamId) {
    offers.push({ teamId: p.teamId, level: p.level, kind: "stay-minors", label: `Stay at ${p.level} with ${TEAM_NAME(p.teamId)}` });
  }
  return offers;
}

// Applies whichever offer the user accepted on the contract-decision
// screen: moves them to the new team/level (if any) and signs the new
// contract, then hands control back to the regular season screen.
function acceptContractOffer(state, offer) {
  const p = state.player;
  if (offer.kind === "stay-minors") {
    p.contract = generateContract(p, offer.level, rnd(1, 2));
  } else {
    removeFromCurrentRoster(state, p);
    p.teamId = offer.teamId;
    p.orgId = offer.teamId;
    p.level = offer.level;
    const team = state.teams[offer.teamId];
    if (team && !team.roster.find(r => r.id === p.id)) team.roster.push(p);
    p.contract = { level: offer.level, salary: offer.salary, years: offer.years, yearSigned: state.year, type: "Pro Contract", bonus: Math.round(offer.salary * rnd(5, 20)) / 100 };
    addNews(state, `${p.name} signs with ${TEAM_NAME(offer.teamId)} (${offer.level}): $${offer.salary}M/yr for ${offer.years} yr${offer.years > 1 ? "s" : ""}.`);
    toast(`Signed with ${TEAM_NAME(offer.teamId)}!`);
  }
  finishContractDecision(state);
}

function levelHasLowerOption(p) {
  if (MINOR_LEVELS.includes(p.level)) return MINOR_LEVELS.indexOf(p.level) > 0;
  return true; // MLB/NPB/KBO players can always drop into a minor-league deal
}
function levelHasHigherOption(p) {
  return MINOR_LEVELS.includes(p.level); // top pro levels have nowhere higher to go
}

// "Ask to go to a lower/secondary league": one minor level down, or
// (from a top pro league) an outright drop into a Triple-A deal.
function moveToLowerLevel(state, p) {
  removeFromCurrentRoster(state, p);
  if (MINOR_LEVELS.includes(p.level)) {
    const prev = MINOR_LEVELS[MINOR_LEVELS.indexOf(p.level) - 1];
    if (!prev) return;
    assignToMinorTeam(state, p, prev, p.orgId);
    p.contract = generateContract(p, prev, rnd(1, 2));
    addNews(state, `${p.name} agrees to drop down to ${prev} for more playing time.`);
  } else {
    assignToMinorTeam(state, p, "Triple-A");
    p.contract = generateContract(p, "Triple-A", rnd(1, 2));
    addNews(state, `${p.name} signs a minor league deal, reporting to Triple-A.`);
  }
  toast(`Now playing at ${p.level}.`);
  finishContractDecision(state);
}

// "Ask to move up a league": one minor level up, or the call-up to
// the parent org's MLB/NPB/KBO roster from the top of the minors.
function moveToHigherLevel(state, p) {
  if (!MINOR_LEVELS.includes(p.level)) return;
  removeFromCurrentRoster(state, p);
  const next = MINOR_LEVELS[MINOR_LEVELS.indexOf(p.level) + 1];
  if (next) {
    assignToMinorTeam(state, p, next, p.orgId);
    p.contract = generateContract(p, next, rnd(1, 2));
    addNews(state, `${p.name} signs on to open the year at ${next}.`);
  } else {
    const org = ALL_PRO_TEAMS.find(t => t.id === p.orgId) || pick(MLB_TEAMS);
    p.level = org.league;
    p.teamId = org.id;
    p.orgId = org.id;
    const team = state.teams[org.id];
    if (team) team.roster.push(p);
    p.contract = generateContract(p, p.level, rnd(1, 3));
    addNews(state, `CALL-UP! ${p.name} earns a spot on the ${TEAM_NAME(org.id)} roster to open the year.`);
  }
  toast(`Now playing at ${p.level}.`);
  finishContractDecision(state);
}

function finishContractDecision(state) {
  state.pendingContractDecision = false;
  state.contractOffers = null;
  state.phase = "season";
}

// ---- Season Summary screen (shown once the season's schedule is done) ----
function screenSeasonSummary() {
  const wrap = el("div");
  const recap = STATE.seasonRecap;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, recap ? `${recap.year} Season Complete` : "Season Complete"));
  if (recap) {
    card.appendChild(el("p", { class: "small-note" }, `${recap.gamesPlayed} games played at ${recap.level}${recap.teamId ? " — " + TEAM_NAME(recap.teamId) : ""}.`));
    card.appendChild(recap.isPitcher
      ? pitchingStatTable([{ label: String(recap.year), s: recap.pitching }])
      : battingStatTable([{ label: String(recap.year), s: recap.batting }]));
  } else {
    card.appendChild(el("p", { class: "small-note" }, "No player stats to show for this season."));
  }
  const row = el("div", { class: "btn-row" });
  row.appendChild(el("button", { class: "btn amber", onclick: () => {
    if (STATE.pendingContractDecision) {
      STATE.contractOffers = generateContractOffers(STATE, STATE.player);
      STATE.phase = "contract-decision";
    } else {
      STATE.phase = "season";
    }
    renderAll();
  } }, STATE.pendingContractDecision ? "Continue to Contract Decisions →" : `Continue to ${STATE.year} Season →`));
  card.appendChild(row);
  wrap.appendChild(card);
  return wrap;
}

// ---- Contract Decision screen (shown when the user's deal just expired) ----
function screenContractDecision() {
  const wrap = el("div");
  const p = STATE.player;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Contract Decision"));
  card.appendChild(el("p", { class: "small-note" }, `${p.name}'s contract has run out. Sign one of the offers below, or ask to change level, before the ${STATE.year} season begins.`));
  wrap.appendChild(card);

  const offers = STATE.contractOffers || [];
  if (offers.length) {
    const offersCard = el("div", { class: "card" });
    offersCard.appendChild(el("h3", {}, "Offers"));
    for (const offer of offers) {
      const row = el("div", { class: "btn-row", style: "align-items:center; justify-content:space-between;" });
      const bits = [];
      if (offer.salary != null) bits.push(`$${offer.salary}M/yr`);
      if (offer.years) bits.push(`${offer.years} yr${offer.years > 1 ? "s" : ""}`);
      row.appendChild(el("div", {}, [
        el("div", {}, offer.label),
        bits.length ? el("div", { class: "small-note" }, bits.join(" · ")) : null
      ]));
      row.appendChild(el("button", { class: "btn amber", onclick: () => { acceptContractOffer(STATE, offer); renderAll(); } }, "Accept"));
      offersCard.appendChild(row);
    }
    wrap.appendChild(offersCard);
  }

  const levelCard = el("div", { class: "card" });
  levelCard.appendChild(el("h3", {}, "Or change level"));
  const row = el("div", { class: "btn-row" });
  if (levelHasLowerOption(p)) row.appendChild(el("button", { class: "btn secondary", onclick: () => { moveToLowerLevel(STATE, p); renderAll(); } }, "Drop to a Lower League"));
  if (levelHasHigherOption(p)) row.appendChild(el("button", { class: "btn secondary", onclick: () => { moveToHigherLevel(STATE, p); renderAll(); } }, "Push Up a Level"));
  levelCard.appendChild(row);
  wrap.appendChild(levelCard);

  return wrap;
}


// ============================================================
// SCREEN: CHARACTER CREATION
// ============================================================
function screenCreation() {
  const wrap = el("div", { class: "card" });
  wrap.appendChild(el("h2", {}, "Create Your Player"));
  wrap.appendChild(el("p", { class: "small-note" }, "Build the ballplayer whose life and career you'll live out — from first tryout to Hall of Fame."));

  const grid = el("div", { class: "grid-2" });

  const left = el("div");
  left.appendChild(el("label", {}, "Full Name"));
  const nameInput = el("input", { type: "text", value: CREATION.name, placeholder: "e.g. Marcus Alou", oninput: e => CREATION.name = e.target.value });
  left.appendChild(nameInput);

  left.appendChild(el("label", {}, "Starting Age"));
  const ageInput = el("input", { type: "number", min: "16", max: "22", value: CREATION.age, oninput: e => CREATION.age = parseInt(e.target.value) || 17 });
  left.appendChild(ageInput);

  left.appendChild(el("label", {}, "Nationality"));
  const natSel = el("select", { onchange: e => CREATION.nationality = e.target.value });
  for (const n of NATIONALITIES) natSel.appendChild(el("option", { value: n, ...(n === CREATION.nationality ? { selected: "selected" } : {}) }, n));
  left.appendChild(natSel);

  left.appendChild(el("label", {}, "Height (inches)"));
  left.appendChild(el("input", { type: "number", min: "64", max: "82", value: CREATION.height, oninput: e => CREATION.height = parseInt(e.target.value) || 72 }));

  left.appendChild(el("label", {}, "Weight (lbs)"));
  left.appendChild(el("input", { type: "number", min: "140", max: "260", value: CREATION.weight, oninput: e => CREATION.weight = parseInt(e.target.value) || 190 }));

  const right = el("div");
  right.appendChild(el("label", {}, "Position"));
  const posSel = el("select", { onchange: e => CREATION.position = e.target.value });
  const posGroup = el("optgroup", { label: "Position Players" });
  for (const p of POSITIONS.batters) posGroup.appendChild(el("option", { value: p, ...(p === CREATION.position ? { selected: "selected" } : {}) }, p));
  const pitGroup = el("optgroup", { label: "Pitchers" });
  for (const p of POSITIONS.pitchers) pitGroup.appendChild(el("option", { value: p, ...(p === CREATION.position ? { selected: "selected" } : {}) }, p));
  posSel.appendChild(posGroup); posSel.appendChild(pitGroup);
  right.appendChild(posSel);

  right.appendChild(el("label", {}, "Batting Hand"));
  const batSel = el("select", { onchange: e => CREATION.battingHand = e.target.value });
  for (const b of ["Left", "Right", "Switch"]) batSel.appendChild(el("option", { value: b, ...(b === CREATION.battingHand ? { selected: "selected" } : {}) }, b));
  right.appendChild(batSel);

  right.appendChild(el("label", {}, "Throwing Hand"));
  const thrSel = el("select", { onchange: e => CREATION.throwingHand = e.target.value });
  for (const b of ["Left", "Right"]) thrSel.appendChild(el("option", { value: b, ...(b === CREATION.throwingHand ? { selected: "selected" } : {}) }, b));
  right.appendChild(thrSel);

  grid.appendChild(left); grid.appendChild(right);
  wrap.appendChild(grid);

  const btnRow = el("div", { class: "btn-row" });
  btnRow.appendChild(el("button", {
    class: "btn amber",
    onclick: () => {
      if (!CREATION.name.trim()) { toast("Give your player a name first."); return; }
      STATE = newGameState();
      initLeagueTeams(STATE);
      STATE.player = createUserPlayer(CREATION);
      STATE.phase = "mode-select";
      renderAll();
    }
  }, "Create Player →"));
  wrap.appendChild(btnRow);
  return wrap;
}


// ============================================================
// SCREEN: MODE SELECT
// ============================================================
const MODE_INFO = {
  HS: { title: "High School", desc: "Start at 16–18. Play HS games, train, earn college offers and scout attention, then enter the Draft." },
  College: { title: "College", desc: "Play college seasons, build Draft stock, and get scouted before entering the Draft." },
  Minors: { title: "Minor League", desc: "Skip amateur ball and sign directly into a farm system, climbing from Rookie ball toward the majors." },
  DraftPrep: { title: "Draft Prospect", desc: "Jump straight to pre-Draft: scouting reports, combine, interviews, and mock drafts." },
  Pro: { title: "Pro League Debut", desc: "Begin immediately in MLB, NPB, or KBO, signed straight to a professional roster." }
};

function screenModeSelect() {
  const wrap = el("div", { class: "card" });
  wrap.appendChild(el("h2", {}, `Choose ${STATE.player.name}'s Path`));
  const grid = el("div", { class: "option-grid" });
  for (const [key, info] of Object.entries(MODE_INFO)) {
    grid.appendChild(el("div", {
      class: "option-card",
      onclick: () => { beginCareer(STATE, key); ACTIVE_TAB = "career"; renderAll(); }
    }, [el("h4", {}, info.title), el("p", {}, info.desc)]));
  }
  wrap.appendChild(grid);
  return wrap;
}


// ============================================================
// SCREEN: AMATEUR SEASON (HS/College) — simplified progression sim
// ============================================================
function screenAmateurSeason() {
  const p = STATE.player;
  const wrap = el("div");
  wrap.appendChild(renderPlayerCard(p));

  const card = el("div", { class: "card" });
  const label = STATE.phase === "hs-season" ? "High School" : "College";
  card.appendChild(el("h2", {}, `${label} Season — Age ${p.age}`));
  card.appendChild(el("p", { class: "small-note" }, `Simulate seasons, train your attributes, and build Draft stock. Scouts are watching.`));

  const btnRow = el("div", { class: "btn-row" });
  btnRow.appendChild(el("button", {
    class: "btn amber",
    onclick: () => {
      simAmateurSeason(p);
      if (p.age >= (STATE.phase === "hs-season" ? 18 : 21) || (STATE.phase === "college-season" && p.age >= 21)) {
        addNews(STATE, `${p.name} is heading into the Draft after a strong ${label} career.`);
        STATE.phase = "draft-prep";
      }
      renderAll();
    }
  }, `Simulate ${label} Season →`));

  if (STATE.phase === "hs-season") {
    btnRow.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => { STATE.phase = "college-season"; p.level = "College"; p.age = Math.max(p.age, 19); addNews(STATE, `${p.name} commits to play college baseball.`); renderAll(); }
    }, "Commit to College"));
    btnRow.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => { addNews(STATE, `${p.name} declares early for the Draft.`); STATE.phase = "draft-prep"; renderAll(); }
    }, "Declare for Draft"));
  } else {
    btnRow.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => { addNews(STATE, `${p.name} declares for the Draft.`); STATE.phase = "draft-prep"; renderAll(); }
    }, "Declare for Draft"));
  }
  card.appendChild(btnRow);
  wrap.appendChild(card);

  wrap.appendChild(renderAttributeCard(p));
  return wrap;
}

function simAmateurSeason(p) {
  // Simplified: a handful of simulated games against amateur-level competition
  const opp = createPlayer({ position: isPitcher(p.position) ? "SS" : "SP", levelHint: rnd(15, 35) });
  let lineTotal = { PA: 0, AB: 0, H: 0, HR: 0, SO: 0, BB: 0 };
  const gamesToSim = 20;
  for (let i = 0; i < gamesToSim; i++) {
    if (!isPitcher(p.position)) {
      const res = simPlateAppearance(p, opp);
      lineTotal.PA++;
      if (res.result !== "BB") lineTotal.AB++;
      if (["1B", "2B", "3B", "HR"].includes(res.result)) lineTotal.H++;
      if (res.result === "HR") lineTotal.HR++;
      if (res.result === "SO") lineTotal.SO++;
      if (res.result === "BB") lineTotal.BB++;
    }
  }
  developPlayer(p); // developPlayer() increments p.age by 1 internally
  Object.assign(p.seasonStats.batting, {
    G: p.seasonStats.batting.G + gamesToSim,
    PA: p.seasonStats.batting.PA + lineTotal.PA,
    AB: p.seasonStats.batting.AB + lineTotal.AB,
    H: p.seasonStats.batting.H + lineTotal.H,
    HR: p.seasonStats.batting.HR + lineTotal.HR,
    SO: p.seasonStats.batting.SO + lineTotal.SO,
    BB: p.seasonStats.batting.BB + lineTotal.BB
  });
  finalizeSeasonToCareer(p);
  addNews(STATE, `${p.name} wraps another amateur season, now age ${p.age}. Overall rating: ${overallRating(p)}.`);
}


// ============================================================
// SCREEN: DRAFT PREP
// ============================================================
function screenDraftPrep() {
  const p = STATE.player;
  const wrap = el("div");
  wrap.appendChild(renderPlayerCard(p));
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Pre-Draft Process"));
  card.appendChild(el("p", {}, `Scout Grade: ${scoutGradeLetter(p)} · Potential Ceiling: ${p.potential}/100 · Current Overall: ${overallRating(p)}`));
  card.appendChild(el("p", { class: "small-note" }, "Combine testing, interviews, and mock drafts are underway across the league. It's time to see where you land."));
  const btnRow = el("div", { class: "btn-row" });
  btnRow.appendChild(el("button", {
    class: "btn amber",
    onclick: () => {
      generateDraftClass(STATE, 320);
      const results = runDraft(STATE, 10);
      STATE.phase = "draft-results";
      const mine = results.find(r => r.player.id === p.id);
      if (mine) {
        addNews(STATE, `DRAFTED! ${p.name} selected Round ${mine.round}, Pick ${mine.pick} by the ${TEAM_NAME(mine.team)}.`);
      } else {
        const startLevel = startingMinorLevelForOVR(p);
        addNews(STATE, `${p.name} went undrafted but signs a Minor League deal as a free agent, headed to ${startLevel} ball.`);
        assignToMinorTeam(STATE, p, startLevel);
        p.contract = generateContract(p, startLevel, 1);
      }
      renderAll();
    }
  }, "Enter the Draft →"));
  card.appendChild(btnRow);
  wrap.appendChild(card);
  wrap.appendChild(renderAttributeCard(p));
  return wrap;
}

function scoutGradeLetter(p) {
  const proj = overallRating(p) + p.potential * 0.3;
  if (proj > 85) return "A+ (Elite Prospect)";
  if (proj > 70) return "A (Top Prospect)";
  if (proj > 55) return "B (Solid Prospect)";
  if (proj > 40) return "C (Depth Prospect)";
  return "D (Org Filler)";
}
// Note: TEAM_NAME() lives in js/leagues.js (loaded before this file).


// ============================================================
// SCREEN: DRAFT RESULTS
// ============================================================
function screenDraftResults() {
  const wrap = el("div", { class: "card" });
  wrap.appendChild(el("h2", {}, `${STATE.year} MLB Draft — Results`));
  const p = STATE.player;
  const mine = (STATE.draftResults || []).find(r => r.player.id === p.id);
  if (mine) {
    wrap.appendChild(el("p", {}, `You were selected in Round ${mine.round}, Pick ${mine.pick} overall, by the ${TEAM_NAME(mine.team)}.`));
  } else {
    wrap.appendChild(el("p", {}, `You went undrafted, but signed as a free agent with the ${TEAM_NAME(p.teamId)}.`));
  }
  wrap.appendChild(el("h3", {}, "First Round"));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, [el("th", {}, "Pick"), el("th", {}, "Team"), el("th", {}, "Player"), el("th", {}, "Pos")]));
  for (const r of (STATE.draftResults || []).filter(r => r.round === 1)) {
    const isMe = r.player.id === p.id;
    table.appendChild(el("tr", { class: isMe ? "user-row" : "" }, [
      el("td", {}, String(r.pick)), el("td", {}, TEAM_NAME(r.team)), el("td", {}, r.player.name + (isMe ? " (YOU)" : "")), el("td", {}, r.player.position)
    ]));
  }
  wrap.appendChild(table);
  wrap.appendChild(el("div", { class: "btn-row" }, [
    el("button", { class: "btn amber", onclick: () => {
      const startLevel = startingMinorLevelForOVR(p);
      assignToMinorTeam(STATE, p, startLevel, p.orgId);
      p.contract = generateContract(p, startLevel, 1);
      STATE.phase = "season"; ACTIVE_TAB = "career";
      addNews(STATE, `${p.name} reports to ${startLevel} ball with the ${TEAM_NAME(p.orgId)} organization.`);
      renderAll();
    } }, "Report to Minor League Camp →")
  ]));
  return wrap;
}


// ============================================================
// SCREEN: TEAM SELECT (Pro mode)
// ============================================================
function screenTeamSelect() {
  const wrap = el("div", { class: "card" });
  wrap.appendChild(el("h2", {}, "Choose Your League"));
  const grid = el("div", { class: "option-grid" });
  for (const lg of ["MLB", "NPB", "KBO"]) {
    grid.appendChild(el("div", {
      class: "option-card",
      onclick: () => {
        const teams = STATE.allTeams.filter(t => t.league === lg);
        const team = pick(teams);
        const p = STATE.player;
        p.teamId = team.id; p.orgId = team.id; p.level = lg; p.yearsPro = 1;
        p.contract = generateContract(p, lg, 2);
        team.roster.push(p);
        addNews(STATE, `${p.name} signs with the ${team.name} to begin a professional career in ${lg}.`);
        STATE.phase = "season"; ACTIVE_TAB = "career";
        renderAll();
      }
    }, [el("h4", {}, lg), el("p", {}, LEAGUES[lg].name)]));
  }
  wrap.appendChild(grid);
  return wrap;
}


// ---- Roster ----
// Defensive slots in a sensible display order, plus the pitching roles.
// Used both for the "Position Leaders" strip and for filling out a
// predicted lineup.
const ROSTER_POSITION_ORDER = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP", "RP", "CP"];

// Best player at each position on the roster (the team's "core" at that
// spot) — highest overall rating, healthy players preferred over injured
// ones when both exist at a position. Positions nobody currently plays
// are simply omitted.
function positionLeaders(roster) {
  const leaders = [];
  for (const slot of ROSTER_POSITION_ORDER) {
    const atSlot = roster.filter(pl => pl.position === slot);
    if (!atSlot.length) continue;
    atSlot.sort((a, b) => {
      const aHealthy = a.health.status === "Healthy", bHealthy = b.health.status === "Healthy";
      if (aHealthy !== bHealthy) return aHealthy ? -1 : 1;
      return overallRating(b) - overallRating(a);
    });
    leaders.push({ slot, player: atSlot[0] });
  }
  return leaders;
}

// Non-mutating preview of who would start on the mound next game. Mirrors
// pickStartingPitcher()'s rest rule and scoring, but never writes
// lastStartDay or otherwise touches team state — this is a projection for
// display, not an actual rotation decision, so looking at the Roster tab
// repeatedly must never burn a pitcher's turn.
function previewStartingPitcher(team) {
  const coach = getTeamCoach(team);
  const today = (typeof STATE !== "undefined" && STATE) ? STATE.day : null;
  const allSps = (team.roster || []).filter(pl => pl.position === "SP" && pl.health.status === "Healthy");
  const daysSinceStart = (pl) => (today == null || typeof pl.lastStartDay !== "number") ? Infinity : today - pl.lastStartDay;
  let sps = allSps.filter(pl => daysSinceStart(pl) >= REST_DAYS_MIN);
  if (!sps.length) sps = [...allSps].sort((a, b) => daysSinceStart(b) - daysSinceStart(a));
  if (!sps.length) {
    const anyP = (team.roster || []).filter(pl => isPitcher(pl.position)).sort((a, b) => pitchingOverall(b) - pitchingOverall(a));
    return anyP.length ? anyP[0] : null;
  }
  if (sps.length === 1) return sps[0];
  // Same scoring shape as pickStartingPitcher, but report the top-scored
  // arm directly rather than doing a weighted random roll — a prediction
  // should show the most likely starter, not sample one possible outcome.
  const scored = sps.map(pl => {
    let score = pitchingOverall(pl) * 1.5;
    if (coach.personality === "Development-Focused") score += clamp((28 - pl.age) * 2.5, -10, 20);
    else if (coach.personality === "Veteran-Favoring") score += clamp((pl.yearsPro || 0) * 2, 0, 16);
    else if (coach.personality === "Hot Hand") score += recentForm(pl) * 1.2;
    if (pl.isUser) score += userFormBonus(pl) * 0.4 + userTrustBonus(team);
    return { player: pl, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].player;
}

function renderRosterView() {
  const p = STATE.player;
  const card = el("div", { class: "card" });
  const team = STATE.teams[p.teamId] || STATE.teams[p.orgId];
  card.appendChild(el("h2", {}, `Roster — ${team ? team.name : p.level}`));

  const roster = team ? [...team.roster] : [p];
  if (team && !roster.find(r => r.id === p.id) && p.teamId === team.id) roster.push(p);

  // ---- Position Leaders: the team's core starter at each position ----
  if (team) {
    card.appendChild(el("h3", {}, "Position Leaders"));
    card.appendChild(el("p", { class: "small-note" }, "The top player currently rostered at each position."));
    const leaderGrid = el("div", { class: "option-grid" });
    for (const { slot, player: leader } of positionLeaders(roster)) {
      const isMe = leader.id === p.id;
      leaderGrid.appendChild(el("div", { class: "option-card" }, [
        el("h4", {}, slot),
        el("p", {}, leader.name + (isMe ? " (YOU)" : "")),
        el("p", { class: "small-note" }, `OVR ${overallRating(leader)} · ${leader.health.status}`)
      ]));
    }
    card.appendChild(leaderGrid);
  }

  // ---- Predicted lineup for the next game ----
  if (team) {
    card.appendChild(el("h3", { style: "margin-top:18px;" }, "Predicted Lineup — Next Game"));
    card.appendChild(el("p", { class: "small-note" }, "Projected batting order and starting pitcher if the game were played today. The coach's actual call on the day can still shift with health, rest, and form."));

    const previewPitcher = previewStartingPitcher(team);
    if (previewPitcher) {
      const pitcherRow = el("div", { class: "stat-strip" });
      pitcherRow.appendChild(statBox("Starting Pitcher", previewPitcher.name + (previewPitcher.id === p.id ? " (YOU)" : "")));
      pitcherRow.appendChild(statBox("Pitcher OVR", String(pitchingOverall(previewPitcher))));
      card.appendChild(pitcherRow);
    }

    const lineupInfo = buildLineup(team);
    const lineupTable = el("table", { class: "stat-table" });
    lineupTable.appendChild(el("tr", {}, ["#", "Pos", "Player", "OVR"].map(h => el("th", {}, h))));
    for (const slotEntry of lineupInfo.order) {
      const isMe = slotEntry.player.id === p.id;
      lineupTable.appendChild(el("tr", { class: isMe ? "user-row" : "" }, [
        el("td", {}, String(slotEntry.battingOrder)),
        el("td", {}, slotEntry.position),
        el("td", {}, slotEntry.player.name + (isMe ? " (YOU)" : "")),
        el("td", {}, String(battingOverall(slotEntry.player)))
      ]));
    }
    card.appendChild(lineupTable);
  }

  // ---- Full roster ----
  card.appendChild(el("h3", { style: "margin-top:18px;" }, "Full Roster"));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["Name", "Pos", "Age", "OVR", "Status"].map(h => el("th", {}, h))));
  roster.sort((a, b) => overallRating(b) - overallRating(a));
  for (const pl of roster.slice(0, 40)) {
    const isMe = pl.id === p.id;
    table.appendChild(el("tr", { class: isMe ? "user-row" : "" }, [
      el("td", {}, pl.name + (isMe ? " (YOU)" : "")),
      el("td", {}, pl.position),
      el("td", {}, String(pl.age)),
      el("td", {}, String(overallRating(pl))),
      el("td", {}, pl.health.status)
    ]));
  }
  card.appendChild(table);
  return card;
}


// ---- Coach ----
// Coach's trust in the user, expressed as a short read-out rather than
// just the raw 0-100 number.
function trustLabel(trust) {
  if (trust >= 80) return "Excellent";
  if (trust >= 65) return "Good";
  if (trust >= 40) return "Neutral";
  if (trust >= 20) return "Shaky";
  return "Poor";
}

let COACH_LAST_REPLY = null; // { prompt, line, delta } — shown until the next visit

function renderCoachView() {
  const p = STATE.player;
  const card = el("div", { class: "card" });
  if (!p) { card.appendChild(el("h2", {}, "Coach")); card.appendChild(el("p", { class: "small-note" }, "No active player yet.")); return card; }
  const team = STATE.teams[p.teamId];
  if (!team) {
    card.appendChild(el("h2", {}, "Coach"));
    card.appendChild(el("p", { class: "small-note" }, "You don't have a team/coach right now."));
    return card;
  }
  const coach = getTeamCoach(team);
  const wrap = el("div");

  card.appendChild(el("h2", {}, `Coach ${coach.name}`));
  card.appendChild(el("p", { class: "small-note" }, `${team.name} — ${COACH_PERSONALITIES[coach.personality].desc}`));
  const strip = el("div", { class: "stat-strip" });
  strip.appendChild(statBox(coach.personality, "Style"));
  strip.appendChild(statBox(trustLabel(coach.trustInUser), "Trust"));
  strip.appendChild(statBox(String(coach.trustInUser), "Trust (0-100)"));
  card.appendChild(strip);

  if (COACH_LAST_REPLY) {
    const box = el("div", { class: "card", style: "margin-top:12px;background:rgba(232,163,61,0.06);" });
    box.appendChild(el("p", { class: "small-note" }, `You: "${COACH_LAST_REPLY.prompt}"`));
    box.appendChild(el("p", {}, `${coach.name}: "${COACH_LAST_REPLY.line}"`));
    card.appendChild(box);
  }
  wrap.appendChild(card);

  // ---- Talk topics ----
  const talkCard = el("div", { class: "card" });
  talkCard.appendChild(el("h2", {}, "Talk to Your Coach"));
  talkCard.appendChild(el("p", { class: "small-note" }, "Conversation nudges trust up or down immediately, based on how it goes."));
  const talkGrid = el("div", { class: "option-grid" });
  for (const topicKey of Object.keys(COACH_TALK_TOPICS)) {
    talkGrid.appendChild(el("div", {
      class: "option-card",
      onclick: () => {
        COACH_LAST_REPLY = talkToCoach(team, topicKey, p);
        renderAll();
      }
    }, [el("h4", {}, topicKey), el("p", {}, COACH_TALK_TOPICS[topicKey].prompt)]));
  }
  talkCard.appendChild(talkGrid);
  wrap.appendChild(talkCard);

  // ---- Requests ----
  const reqCard = el("div", { class: "card" });
  reqCard.appendChild(el("h2", {}, "Make a Request"));
  reqCard.appendChild(el("p", { class: "small-note" }, `Each request is limited to once every ${COACH_REQUEST_COOLDOWN_DAYS} days.`));
  const reqRow = el("div", { class: "btn-row" });

  const contractGate = canMakeCoachRequest(team, "contract", STATE.day + (STATE.year - 2026) * 365);
  reqRow.appendChild(el("button", {
    class: "btn secondary",
    disabled: !contractGate.allowed,
    onclick: () => {
      const dayKey = STATE.day + (STATE.year - 2026) * 365;
      const res = requestNewContract(STATE, team, p);
      recordCoachRequest(team, "contract", dayKey);
      COACH_LAST_REPLY = { prompt: "Can we talk about a new contract?", line: res.line };
      toast(res.success ? "New contract signed!" : "Coach turned down the request.");
      renderAll();
    }
  }, contractGate.allowed ? "Ask for New Contract" : `Ask for New Contract (${contractGate.daysLeft}d)`));

  const demoteGate = canMakeCoachRequest(team, "demotion", STATE.day + (STATE.year - 2026) * 365);
  reqRow.appendChild(el("button", {
    class: "btn secondary",
    disabled: !demoteGate.allowed || !MINOR_LEVELS.includes(p.level),
    onclick: () => {
      const dayKey = STATE.day + (STATE.year - 2026) * 365;
      const res = requestDemotion(STATE, team, p);
      recordCoachRequest(team, "demotion", dayKey);
      COACH_LAST_REPLY = { prompt: "Send me down for more reps?", line: res.line };
      toast(res.success ? "Sent down for more reps." : "Coach wants to keep you here.");
      renderAll();
    }
  }, demoteGate.allowed ? "Ask to Drop a Level" : `Ask to Drop a Level (${demoteGate.daysLeft}d)`));

  const promoteGate = canMakeCoachRequest(team, "promotion", STATE.day + (STATE.year - 2026) * 365);
  reqRow.appendChild(el("button", {
    class: "btn amber",
    disabled: !promoteGate.allowed,
    onclick: () => {
      const dayKey = STATE.day + (STATE.year - 2026) * 365;
      const res = requestPromotion(STATE, team, p);
      recordCoachRequest(team, "promotion", dayKey);
      COACH_LAST_REPLY = { prompt: "I'm ready for the next level — can I get a shot?", line: res.line };
      toast(res.success ? "Promoted!" : "Coach says not yet.");
      renderAll();
    }
  }, promoteGate.allowed ? "Ask to Move Up a Level" : `Ask to Move Up a Level (${promoteGate.daysLeft}d)`));

  reqCard.appendChild(reqRow);
  wrap.appendChild(reqCard);

  return wrap;
}


// ---- Training ----
function renderTrainingView() {
  const p = STATE.player;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Training"));
  card.appendChild(el("p", { class: "small-note" }, `Fatigue: ${p.fatigue}/100. Training carries a small injury risk and occasional breakthroughs.`));
  const grid = el("div", { class: "option-grid" });
  for (const focus of Object.keys(TRAINING_FOCI)) {
    grid.appendChild(el("div", {
      class: "option-card",
      onclick: () => {
        const log = runTraining(p, focus);
        for (const e of log.events) addNews(STATE, e);
        toast(log.events[0]);
        renderAll();
      }
    }, [el("h4", {}, focus.replace(" Training", "")), el("p", {}, `Targets: ${TRAINING_FOCI[focus].attrs.map(a => a[1]).join(", ")}`)]));
  }
  card.appendChild(grid);
  return card;
}


// ---- Standings ----
function standingsTable(teams) {
  const sorted = [...teams].sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["Team", "W", "L", "PCT"].map(h => el("th", {}, h))));
  for (const t of sorted) {
    const pct = t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0;
    const isMine = STATE.player && (STATE.player.teamId === t.id);
    table.appendChild(el("tr", { class: isMine ? "user-row" : "" }, [
      el("td", {}, t.name), el("td", {}, String(t.wins)), el("td", {}, String(t.losses)), el("td", {}, fmt3(pct))
    ]));
  }
  return table;
}

function renderStandingsView() {
  const wrap = el("div");
  for (const lg of ["MLB", "NPB", "KBO"]) {
    const card = el("div", { class: "card" });
    card.appendChild(el("h2", {}, lg + " Standings"));
    card.appendChild(standingsTable(STATE.allTeams.filter(t => t.league === lg)));
    wrap.appendChild(card);
  }

  // The user's own minor league (if they're in the minors) gets its own
  // standings table so they can see where their affiliate stands within
  // its actual league, rather than only the top-level pro leagues.
  const p = STATE.player;
  const myTeam = p ? STATE.teams[p.teamId] : null;
  if (myTeam && myTeam.leagueGroup) {
    const card = el("div", { class: "card" });
    card.appendChild(el("h2", {}, `${myTeam.minorLevel} — ${myTeam.minorLeagueName} Standings`));
    card.appendChild(standingsTable(STATE.allTeams.filter(t => t.leagueGroup === myTeam.leagueGroup)));
    wrap.appendChild(card);
  }
  return wrap;
}


// ---- Awards ----
function renderAwardsView() {
  const p = STATE.player;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Awards & Legacy"));
  if (!p.awards.length) card.appendChild(el("p", { class: "small-note" }, "No awards yet — keep grinding. Legacy is built one season at a time."));
  for (const a of p.awards) card.appendChild(el("div", { class: "badge" }, a));
  return card;
}


// ============================================================
// TAB ROUTER (main career loop)
// ============================================================
function screenTab(tab) {
  const wrap = el("div");
  if (tab === "gameday") { wrap.appendChild(renderGameDayView()); }
  else if (tab === "career") { wrap.appendChild(renderPlayerCard(STATE.player)); wrap.appendChild(renderSimControls()); wrap.appendChild(renderRivalryTransactions()); wrap.appendChild(renderRecentLog()); wrap.appendChild(renderAttributeCard(STATE.player)); }
  else if (tab === "roster") wrap.appendChild(renderRosterView());
  else if (tab === "coach") wrap.appendChild(renderCoachView());
  else if (tab === "training") wrap.appendChild(renderTrainingView());
  else if (tab === "stats") wrap.appendChild(renderStatsView());
  else if (tab === "standings") wrap.appendChild(renderStandingsView());
  else if (tab === "contracts") wrap.appendChild(renderContractView());
  else if (tab === "awards") wrap.appendChild(renderAwardsView());
  else if (tab === "news") wrap.appendChild(renderNewsView());
  else if (tab === "save") wrap.appendChild(renderSaveView());
  return wrap;
}

// ---- Player Card ----
function renderPlayerCard(p) {
  const card = el("div", { class: "player-card" });
  card.appendChild(el("div", { class: "player-avatar" }, p.name.split(" ").map(w => w[0]).join("").slice(0, 2)));
  const info = el("div");
  info.appendChild(el("div", { class: "player-name" }, p.name));
  info.appendChild(el("div", { class: "player-meta" }, `${p.position} · Age ${p.age} · ${p.nationality} · Bats ${p.battingHand[0]} / Throws ${p.throwingHand[0]}`));
  const badges = el("div");
  const teamForBadge = STATE && STATE.teams ? STATE.teams[p.teamId] : null;
  const levelBadge = teamForBadge && teamForBadge.minorLeagueName
    ? `${p.level} (${teamForBadge.minorLeagueName}) — ${teamForBadge.name}`
    : `${p.level}${p.orgId ? " — " + TEAM_NAME(p.orgId) : ""}`;
  badges.appendChild(el("span", { class: "badge" }, levelBadge));
  badges.appendChild(el("span", { class: `badge ${p.health.status === "Healthy" ? "healthy" : "injured"}` }, p.health.status === "Healthy" ? "Healthy" : `${p.health.injury} (${p.health.daysOut}d)`));
  badges.appendChild(el("span", { class: "badge" }, p.personality));
  info.appendChild(badges);

  const stats = el("div", { class: "stat-strip" });
  stats.appendChild(statBox("OVR", overallRating(p)));
  stats.appendChild(statBox("POT", p.potential));
  if (!isPitcher(p.position)) {
    const r = battingRates(p.seasonStats.batting);
    stats.appendChild(statBox("AVG", fmt3(r.AVG)));
    stats.appendChild(statBox("OPS", fmt3(r.OPS)));
    stats.appendChild(statBox("HR", p.seasonStats.batting.HR));
  } else {
    const r = pitchingRates(p.seasonStats.pitching);
    stats.appendChild(statBox("ERA", r.ERA.toFixed(2)));
    stats.appendChild(statBox("W-L", `${p.seasonStats.pitching.W}-${p.seasonStats.pitching.L}`));
    stats.appendChild(statBox("SO", p.seasonStats.pitching.SO));
  }
  info.appendChild(stats);
  card.appendChild(info);
  return card;
}
function statBox(lbl, val) { return el("div", { class: "stat-box" }, [el("div", { class: "val" }, String(val)), el("div", { class: "lbl" }, lbl)]); }


// ============================================================
// RIVALRY / TRANSACTIONS SYSTEM
// ============================================================
function ensureCareerSystems(state) {
  state.rivalries ||= {};
  state.tradeOffers ||= [];
  state.waiverClaims ||= [];
  state.freeAgentPool ||= [];
  state.transactionLog ||= [];
  state.transactionState ||= { lastTradeDay: 0, lastWaiverDay: 0, lastFAActionDay: 0 };
}

function rivalryKey(kind, id) { return `${kind}:${id}`; }

function updateUserRivalries(state, result) {
  const p = state.player;
  if (!p || !result) return;
  ensureCareerSystems(state);
  const isUserBatter = !isPitcher(p.position);
  const userLine = isUserBatter ? result.game.lines.get(p.id) : result.game.pitcherLines.get(p.id);
  if (!userLine) return;

  if (isUserBatter) {
    for (const line of result.game.pitcherLines.values()) {
      const u = result.game.pitcherUsage.get(line.player.id);
      if (!u) continue;
      const matchup = result.game.matchupLines && result.game.matchupLines.get(`${p.id}:${line.player.id}`);
      if (!matchup || matchup.AB <= 0) continue;
      const key = rivalryKey("pitcher", line.player.id);
      const r = state.rivalries[key] ||= { kind: "pitcher", id: line.player.id, name: line.player.name, teamId: u.team === "home" ? result.homeTeam.id : result.awayTeam.id, meetings: 0, shutDowns: 0, hits: 0, atBats: 0, pressure: 0, redemption: 0 };
      const ab = matchup.AB || 0;
      const h = matchup.H || 0;
      r.meetings++; r.atBats += ab; r.hits += h;
      if (h === 0 && ab >= 2) r.shutDowns++;
      r.pressure = clamp(r.shutDowns * 4 - r.hits * 0.5, -10, 20);
      r.redemption = r.shutDowns >= 2 && h > 0 ? Math.min(15, r.redemption + 5) : Math.max(0, r.redemption - 1);
    }
    const oppTeam = result.homeTeam.id === p.teamId ? result.awayTeam : result.awayTeam.id === p.teamId ? result.homeTeam : null;
    if (oppTeam) {
      const key = rivalryKey("team", oppTeam.id);
      const r = state.rivalries[key] ||= { kind: "team", id: oppTeam.id, name: oppTeam.name, teamId: oppTeam.id, meetings: 0, shutDowns: 0, hits: 0, atBats: 0, pressure: 0, redemption: 0 };
      const ab = userLine.AB || 0, h = userLine.H || 0;
      r.meetings++; r.atBats += ab; r.hits += h;
      if (ab >= 3 && h === 0) r.shutDowns++;
      r.pressure = clamp(r.shutDowns * 3 - r.hits * 0.25, -8, 15);
      r.redemption = r.shutDowns >= 2 && h > 0 ? Math.min(12, r.redemption + 4) : r.redemption;
    }
  } else {
    const oppTeam = result.homeTeam.id === p.teamId ? result.awayTeam : result.awayTeam.id === p.teamId ? result.homeTeam : null;
    if (!oppTeam) return;
    const key = rivalryKey("team", oppTeam.id);
    const r = state.rivalries[key] ||= { kind: "team", id: oppTeam.id, name: oppTeam.name, teamId: oppTeam.id, meetings: 0, shutDowns: 0, hits: 0, atBats: 0, pressure: 0, redemption: 0 };
    const er = userLine.ER || 0, outs = userLine.outs || 0, so = userLine.SO || 0;
    r.meetings++;
    if (outs >= 9 && er <= 1) r.shutDowns++;
    else if (er >= 4) r.shutDowns = Math.max(0, r.shutDowns - 1);
    r.pressure = clamp(r.shutDowns * 3 - so * 0.2, -8, 15);
    if (r.shutDowns >= 2 && er <= 1) r.redemption = Math.min(12, r.redemption + 4);
  }

  const rivalEntries = Object.values(state.rivalries).filter(r => r.meetings >= 2).sort((a,b) => (b.shutDowns - a.shutDowns) || (b.pressure - a.pressure));
  const top = rivalEntries[0];
  if (top && top.shutDowns >= 2 && state.day % 7 === 0) {
    addNews(state, `${p.name} seeks revenge against ${top.name} after repeated struggles.`, "A developing rivalry is turning routine games into a personal test.");
  }
}

function rivalryModifierForGame(state, team, opponent) {
  const p = state.player;
  if (!p || !opponent) return { clutch: 0 };
  const teamR = state.rivalries?.[rivalryKey("team", opponent.id)];
  let clutch = teamR ? (teamR.redemption || 0) - (teamR.pressure || 0) : 0;
  return { clutch: clamp(clutch, -12, 12), opponentTeamId: opponent.id };
}

function rosterRemove(team, player) { if (team) team.roster = (team.roster || []).filter(p => p.id !== player.id); }
function rosterAdd(team, player) { if (team && !(team.roster || []).some(p => p.id === player.id)) team.roster.push(player); player.teamId = team.id; player.orgId = team.id; }

function generateFreeAgentPool(state) {
  ensureCareerSystems(state);
  if (state.freeAgentPool.length >= 8) return;
  for (let i = state.freeAgentPool.length; i < 12; i++) {
    const level = state.player?.level || "Triple-A";
    const p = createPlayer({ age: rnd(21, 31), levelHint: rnd(30, 58) });
    p.level = level; p.contract = null; p.teamId = null; p.orgId = null;
    state.freeAgentPool.push(p);
  }
}

function processTransactions(state) {
  ensureCareerSystems(state);
  const p = state.player;
  const team = p ? state.teams[p.teamId] : null;
  if (!team) return;
  const len = seasonLengthDaysForPlayer(p);
  const deadline = Math.max(35, Math.floor(len * 0.62));

  // Trade deadline: one meaningful proposal for a bench player.
  if (state.day >= deadline && state.transactionState.lastTradeDay < deadline) {
    state.transactionState.lastTradeDay = state.day;
    const target = (team.roster || []).filter(x => x.id !== p.id && !isPitcher(x.position)).sort((a,b) => overallRating(a)-overallRating(b))[0];
    const rivals = state.allTeams.filter(t => t.id !== team.id && t.league === team.league && (t.roster || []).length);
    if (target && rivals.length) {
      const from = pick(rivals), offer = [...from.roster].sort((a,b)=>overallRating(b)-overallRating(a))[0];
      if (offer) {
        state.tradeOffers.push({ id: uid(), day: state.day, fromTeamId: from.id, targetPlayerId: target.id, offeredPlayerId: offer.id, status: "pending" });
        addNews(state, `TRADE TALK: ${TEAM_NAME(from.id)} offers ${offer.name} for ${target.name}.`);
      }
    }
  }

  // Weekly waiver churn: rival clubs can claim a low-use bench player.
  if (state.day - state.transactionState.lastWaiverDay >= 7) {
    state.transactionState.lastWaiverDay = state.day;
    const bench = (team.roster || []).filter(x => x.id !== p.id && !isPitcher(x.position)).sort((a,b)=>overallRating(a)-overallRating(b))[0];
    if (bench && Math.random() < 0.22) {
      const rivals = state.allTeams.filter(t => t.id !== team.id && t.league === team.league);
      const to = rivals.length ? pick(rivals) : null;
      if (to) {
        state.waiverClaims.push({ id: uid(), day: state.day, playerId: bench.id, toTeamId: to.id, status: "pending" });
        addNews(state, `${to.name} placed a waiver claim on ${bench.name}.`);
      }
    }
  }

  // Late-season free-agent market.
  if (state.day >= Math.floor(len * 0.55) && state.day - state.transactionState.lastFAActionDay >= 10) {
    state.transactionState.lastFAActionDay = state.day;
    generateFreeAgentPool(state);
    for (const fa of state.freeAgentPool.slice(0, 2)) {
      const needy = !team.roster.some(x => x.position === fa.position);
      if (needy && Math.random() < 0.35) {
        rosterAdd(team, fa); state.freeAgentPool = state.freeAgentPool.filter(x => x.id !== fa.id);
        state.transactionLog.unshift({ day: state.day, type: "FA", playerId: fa.id, teamId: team.id });
        addNews(state, `${team.name} signs free agent ${fa.name} to add depth.`);
      }
    }
  }
}

function acceptTradeOffer(id) {
  const offer = STATE.tradeOffers.find(x => x.id === id && x.status === "pending"); if (!offer) return;
  const myTeam = STATE.teams[STATE.player.teamId], from = STATE.teams[offer.fromTeamId];
  const target = myTeam?.roster.find(x => x.id === offer.targetPlayerId), incoming = from?.roster.find(x => x.id === offer.offeredPlayerId);
  if (!target || !incoming) { offer.status = "expired"; return renderAll(); }
  rosterRemove(myTeam, target); rosterRemove(from, incoming); rosterAdd(myTeam, incoming); rosterAdd(from, target);
  offer.status = "accepted"; STATE.transactionLog.unshift({ day: STATE.day, type: "TRADE", in: incoming.id, out: target.id, team: myTeam.id });
  addNews(STATE, `${STATE.player.name}'s club completes a trade: ${incoming.name} arrives for ${target.name}.`); toast("Trade accepted."); renderAll();
}
function rejectTradeOffer(id) { const o = STATE.tradeOffers.find(x => x.id === id); if (o) o.status = "rejected"; toast("Trade rejected."); renderAll(); }
function resolveWaiverClaim(id, keep) {
  const claim = STATE.waiverClaims.find(x => x.id === id && x.status === "pending"); if (!claim) return;
  const myTeam = STATE.teams[STATE.player.teamId], to = STATE.teams[claim.toTeamId];
  const player = myTeam?.roster.find(x => x.id === claim.playerId);
  if (!keep && player && to) { rosterRemove(myTeam, player); rosterAdd(to, player); claim.status = "claimed"; addNews(STATE, `${player.name} was claimed off waivers by ${to.name}.`); }
  else { claim.status = "retained"; }
  renderAll();
}
function signFreeAgent(id) {
  const idx = STATE.freeAgentPool.findIndex(x => x.id === id); if (idx < 0) return;
  const team = STATE.teams[STATE.player.teamId], fa = STATE.freeAgentPool[idx];
  rosterAdd(team, fa); STATE.freeAgentPool.splice(idx, 1); STATE.transactionLog.unshift({ day: STATE.day, type: "FA", playerId: fa.id, teamId: team.id });
  addNews(STATE, `${TEAM_NAME(team.id)} signs free agent ${fa.name}.`); toast(`${fa.name} signed.`); renderAll();
}

function renderRivalryTransactions() {
  ensureCareerSystems(STATE);
  const wrap = el("div");
  const rr = Object.values(STATE.rivalries).filter(r => r.meetings >= 2).sort((a,b)=>b.shutDowns-a.shutDowns).slice(0,6);
  const rc = el("div", { class: "card" }); rc.appendChild(el("h2", {}, "Rivalry & Grudge Matchups"));
  if (!rr.length) rc.appendChild(el("p", { class: "small-note" }, "Rivalries develop naturally after repeated struggles."));
  for (const r of rr) rc.appendChild(el("div", { class: "news-item" }, `${r.name} — ${r.shutDowns} shutdowns · ${r.meetings} meetings · pressure ${r.pressure >= 0 ? "+" : ""}${r.pressure}`));
  wrap.appendChild(rc);

  const tc = el("div", { class: "card" }); tc.appendChild(el("h2", {}, "Trade Deadline & Waivers"));
  const pendingT = STATE.tradeOffers.filter(x=>x.status === "pending");
  if (!pendingT.length) tc.appendChild(el("p", { class: "small-note" }, "No pending trade proposals."));
  for (const o of pendingT) {
    const from = STATE.teams[o.fromTeamId], target = STATE.teams[STATE.player.teamId]?.roster.find(x=>x.id===o.targetPlayerId), incoming = from?.roster.find(x=>x.id===o.offeredPlayerId);
    tc.appendChild(el("div", { class: "news-item" }, [el("div", {}, `${from?.name || "Rival"} offers ${incoming?.name || "a player"} for ${target?.name || "your player"}.`), el("div", { class:"btn-row" }, [el("button", {class:"btn amber", onclick:()=>acceptTradeOffer(o.id)}, "Accept"), el("button", {class:"btn secondary", onclick:()=>rejectTradeOffer(o.id)}, "Reject")])]));
  }
  for (const w of STATE.waiverClaims.filter(x=>x.status === "pending")) {
    const pl = STATE.teams[STATE.player.teamId]?.roster.find(x=>x.id===w.playerId), to = STATE.teams[w.toTeamId];
    if (!pl) continue;
    tc.appendChild(el("div", { class:"news-item" }, [el("div", {}, `${to?.name || "Rival"} wants ${pl.name} on waivers.`), el("div", {class:"btn-row"}, [el("button", {class:"btn amber",onclick:()=>resolveWaiverClaim(w.id,true)},"Keep"),el("button", {class:"btn secondary",onclick:()=>resolveWaiverClaim(w.id,false)},"Let Go")])]));
  }
  generateFreeAgentPool(STATE);
  for (const fa of STATE.freeAgentPool.slice(0,4)) tc.appendChild(el("div", {class:"btn-row"}, [el("span",{},`${fa.name} (${fa.position}, OVR ${overallRating(fa)})`),el("button",{class:"btn secondary",onclick:()=>signFreeAgent(fa.id)},"Sign")]));
  wrap.appendChild(tc); return wrap;
}

// ---- Sim Controls ----
function renderSimControls() {
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Advance Career"));
  card.appendChild(el("p", { class: "small-note" }, `${STATE.year} Season — Day ${STATE.day}. Play today's game inning by inning, fast-sim a day/week/month, or promote/retire when eligible.`));
  const row = el("div", { class: "btn-row" });
  row.appendChild(el("button", { class: "btn amber", onclick: () => { startGameDay(); renderAll(); } }, "Play Today's Game →"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { LAST_GAME_LOGS = summarizeResults(simDay(STATE)); checkPromotion(); maybeEndSeason(STATE); renderAll(); } }, "Sim Day"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { LAST_GAME_LOGS = summarizeResults(simWeek(STATE)); checkPromotion(); maybeEndSeason(STATE); renderAll(); } }, "Sim Week"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { LAST_GAME_LOGS = summarizeResults(simMonth(STATE)); checkPromotion(); maybeEndSeason(STATE); renderAll(); } }, "Sim Month"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => {
    LAST_GAME_LOGS = summarizeResults(simSeason(STATE));
    checkPromotion();
    maybeEndSeason(STATE);
    renderAll();
  } }, "Sim Season →"));
  card.appendChild(row);
  return card;
}

// ---- Game Day (starting lineup -> live inning-by-inning -> final lineup) ----
// GAME_VIEW holds the transient state of "today's" tracked game so the
// player can review both starting lineups, step through the game
// half-inning by half-inning (or jump straight to the final result), and
// see the final lineup with every substitution that happened along the
// way. Lives only in memory - it never needs to be saved, since by the
// time you save/reload the day has already advanced.
// stage: "lineups" -> "live" -> "final"
let GAME_VIEW = null;

function startGameDay() {
  const { results, userGameResult } = simDayWithUserGame(STATE);
  LAST_GAME_LOGS = summarizeResults(results);
  checkPromotion();
  if (maybeEndSeason(STATE)) {
    // Season just wrapped on today's game - hand off to the
    // season-summary screen instead of opening Game Day.
    GAME_VIEW = null;
    ACTIVE_TAB = "career";
    return;
  }
  if (!userGameResult) {
    // Player has no team today (e.g. amateur/free agent/off day) - nothing to watch, just report the day.
    toast("No game scheduled for your team today.");
    GAME_VIEW = null;
    return;
  }
  GAME_VIEW = {
    result: userGameResult,
    stage: "lineups",
    revealedHalfInnings: 0, // how many FULL half-innings from game.log are already locked in on the board
    paIndex: 0,             // index into game.pitchLog of the plate appearance currently being played out live
    pitchIndex: 0,          // how many pitches of the CURRENT PA have been thrown so far
    animPhase: null,        // null | "pitching" | "swinging" | "outcome" — drives the live animation frame
    finished: false
  };
  notifyIfUserStarting(userGameResult);
  ACTIVE_TAB = "gameday";
}

// Tells the user right away whether they're in today's starting lineup
// (as a batter) or on the mound as the starting pitcher, so a run of
// bench days is obvious and doesn't just quietly happen off-screen.
function notifyIfUserStarting(result) {
  const p = STATE.player;
  if (!p || !result) return;
  const startingPitcher = result.homeStartingPitcher.id === p.id || result.awayStartingPitcher.id === p.id;
  const inBattingOrder = [...result.homeLineup.order, ...result.awayLineup.order].some(o => o.player.id === p.id);
  if (startingPitcher) {
    toast(`You're starting on the mound today!`);
    addNews(STATE, `${p.name} gets the ball as the starting pitcher today.`);
  } else if (inBattingOrder) {
    const slot = [...result.homeLineup.order, ...result.awayLineup.order].find(o => o.player.id === p.id);
    toast(`You're in the starting lineup today — batting ${slot.battingOrder}, ${slot.position}.`);
  } else if (!isPitcher(p.position)) {
    toast(`You're not in today's starting lineup.`);
  }
}

// ---- Head-to-Head history ----
// Keeps a compact career-long record of the user's team against each opponent.
// Only completed games are recorded, so the Game Day card can show true
// historical results without relying on the transient GAME_VIEW object.
function ensureH2H(state) {
  if (!state.h2h || typeof state.h2h !== "object" || Array.isArray(state.h2h)) state.h2h = {};
  return state.h2h;
}

function recordUserTeamH2H(state, result) {
  const p = state && state.player;
  if (!p || !result || !result.homeTeam || !result.awayTeam) return;
  const userTeamId = p.teamId || p.orgId;
  if (!userTeamId) return;
  const isHome = result.homeTeam.id === userTeamId;
  const isAway = result.awayTeam.id === userTeamId;
  if (!isHome && !isAway) return;

  const opponent = isHome ? result.awayTeam : result.homeTeam;
  const userScore = isHome ? result.homeScore : result.awayScore;
  const oppScore = isHome ? result.awayScore : result.homeScore;
  const h2h = ensureH2H(state);
  const rec = h2h[opponent.id] || {
    opponentId: opponent.id, opponentName: opponent.name,
    games: 0, wins: 0, losses: 0, ties: 0,
    runsFor: 0, runsAgainst: 0, meetings: []
  };
  rec.opponentName = opponent.name;
  rec.games++;
  rec.runsFor += userScore;
  rec.runsAgainst += oppScore;
  if (userScore > oppScore) rec.wins++;
  else if (userScore < oppScore) rec.losses++;
  else rec.ties++;
  rec.meetings = Array.isArray(rec.meetings) ? rec.meetings : [];
  rec.meetings.unshift({
    year: state.year, day: Math.max(1, state.day),
    home: result.homeTeam.name, away: result.awayTeam.name,
    userScore, oppScore
  });
  rec.meetings = rec.meetings.slice(0, 12);
  h2h[opponent.id] = rec;
}

function getUserTeamH2H(opponentId) {
  const rec = ensureH2H(STATE)[opponentId];
  return rec || { opponentId, games: 0, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, meetings: [] };
}

function renderH2HCard(opponent, compact = false) {
  const rec = getUserTeamH2H(opponent.id);
  const card = el("div", { class: "card h2h-card" });
  card.appendChild(el("h3", {}, `H2H — ${opponent.name}`));
  if (!rec.games) {
    card.appendChild(el("p", { class: "small-note" }, "No previous meetings recorded yet."));
    return card;
  }
  const grid = el("div", { class: "stat-strip" }, [
    statBox("Games", rec.games), statBox("W", rec.wins), statBox("L", rec.losses),
    statBox("Runs", `${rec.runsFor}-${rec.runsAgainst}`)
  ]);
  card.appendChild(grid);
  const recent = (rec.meetings || []).slice(0, compact ? 3 : 5);
  const list = el("div", { style: "margin-top:10px;" });
  for (const g of recent) {
    const resultLabel = g.userScore > g.oppScore ? "W" : g.userScore < g.oppScore ? "L" : "T";
    list.appendChild(el("div", { class: "log-line" },
      `${g.year} Day ${g.day} — ${g.away} ${g.away === g.home ? "" : ""}${g.home === g.away ? "" : ""} — ${g.userScore}-${g.oppScore} (${resultLabel})`));
  }
  card.appendChild(list);
  return card;
}

function renderGameDayView() {
  const gv = GAME_VIEW;
  const wrap = el("div");
  if (!gv) {
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Game Day"),
      el("p", { class: "small-note" }, "No game in progress.")
    ]));
    return wrap;
  }
  if (gv.stage === "lineups") wrap.appendChild(renderStartingLineupsCard(gv));
  else if (gv.stage === "live") wrap.appendChild(renderLiveGameCard(gv));
  else wrap.appendChild(renderFinalLineupsCard(gv));
  return wrap;
}

// ---- Stage 1: Starting Lineups ----
function renderStartingLineupsCard(gv) {
  const { result } = gv;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, `${result.awayTeam.name} @ ${result.homeTeam.name}`));
  card.appendChild(el("p", { class: "small-note" }, `${TEAM_NAME(result.homeTeam.id)} — ${stadiumCapacity((result.homeTeam.stadium || ""))} capacity · Starting lineups below.`));
  const userTeamId = STATE.player && (STATE.player.teamId || STATE.player.orgId);
  const opponent = result.homeTeam.id === userTeamId ? result.awayTeam : result.homeTeam;
  if (opponent) card.appendChild(renderH2HCard(opponent, true));

  const grid = el("div", { class: "grid-2" });
  grid.appendChild(lineupColumn(result.awayTeam, result.awayLineup, result.awayStartingPitcher, STATE.player));
  grid.appendChild(lineupColumn(result.homeTeam, result.homeLineup, result.homeStartingPitcher, STATE.player));
  card.appendChild(grid);

  const btnRow = el("div", { class: "btn-row" });
  btnRow.appendChild(el("button", {
    class: "btn amber",
    onclick: () => { GAME_VIEW.stage = "live"; renderAll(); }
  }, "Play Ball →"));
  card.appendChild(btnRow);
  return card;
}

function lineupColumn(team, lineupInfo, startingPitcher, userPlayer) {
  const box = el("div");
  box.appendChild(el("h3", {}, team.name));
  box.appendChild(el("p", { class: "small-note" }, `Manager: ${lineupInfo.coach.name} — ${lineupInfo.coach.personality} (${COACH_PERSONALITIES[lineupInfo.coach.personality].desc})`));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["#", "Pos", "Player", "OVR"].map(h => el("th", {}, h))));
  for (const slot of lineupInfo.order) {
    const isUser = userPlayer && slot.player.id === userPlayer.id;
    table.appendChild(el("tr", { style: isUser ? "color:var(--amber);font-weight:700;" : "" }, [
      el("td", {}, String(slot.battingOrder)),
      el("td", {}, slot.position),
      el("td", {}, slot.player.name + (isUser ? " (You)" : "")),
      el("td", {}, String(battingOverall(slot.player)))
    ]));
  }
  box.appendChild(table);
  const isUserPitching = userPlayer && startingPitcher.id === userPlayer.id;
  box.appendChild(el("p", { class: "small-note", style: isUserPitching ? "color:var(--amber);font-weight:700;" : "" }, `Starting Pitcher: ${startingPitcher.name}${isUserPitching ? " (You)" : ""} — OVR ${pitchingOverall(startingPitcher)}`));
  return box;
}

// Renders a classic line-score table: away/home team names down the side,
// innings 1-9 (or more, for extras) across the top, plus R/H/E totals.
// `revealedHalves` optionally caps it to only the half-innings played so
// far (for the live view, so it doesn't spoil unplayed innings); omit it
// to show the full completed game (final view).
function renderLineScoreTable(result, revealedHalves) {
  const log = revealedHalves != null ? result.game.log.slice(0, revealedHalves) : result.game.log;
  const partialGame = { ...result.game, log };
  const ls = buildLineScore(partialGame);
  const table = el("table", { class: "stat-table linescore" });
  const headRow = el("tr", {}, [
    el("th", {}, ""),
    ...ls.innings.map(n => el("th", {}, String(n))),
    el("th", {}, "R"), el("th", {}, "H"), el("th", {}, "E")
  ]);
  table.appendChild(headRow);
  const rowFor = (label, side) => el("tr", {}, [
    el("td", { style: "text-align:left;font-weight:600;" }, label),
    ...side.byInning.map(v => el("td", {}, v == null ? "" : String(v))),
    el("td", { style: "font-weight:700;" }, String(side.R)),
    el("td", {}, String(side.H)),
    el("td", {}, String(side.E))
  ]);
  table.appendChild(rowFor(result.awayTeam.name.split(" ").pop(), ls.away));
  table.appendChild(rowFor(result.homeTeam.name.split(" ").pop(), ls.home));
  return table;
}

// ---- Stage 2: Live field view (pitch-by-pitch) ----
// Plays the game one pitch at a time instead of one half-inning at a time.
// gv.paIndex walks through result.game.pitchLog (one entry per plate
// appearance, each already holding its full pitch sequence). gv.pitchIndex
// tracks how many of the CURRENT PA's pitches have been thrown. Once a PA's
// pitches are exhausted, "Next Pitch" reveals that PA's outcome and (if it
// closed out the half-inning) locks the half-inning into the log board below,
// mirroring exactly what the old half-inning-at-a-time view showed, just
// arrived at one pitch at a time.
function renderLiveGameCard(gv) {
  const { result } = gv;
  const log = result.game.log || [];
  const pitchLog = result.game.pitchLog || [];
  const totalHalves = log.length;
  const totalPAs = pitchLog.length;
  gv.paIndex = Math.min(gv.paIndex, totalPAs);
  if (gv.paIndex >= totalPAs) { gv.finished = true; }

  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, `${result.awayTeam.name} @ ${result.homeTeam.name}`));

  // How many half-innings are FULLY complete given how many PAs we've played
  // through live (used to decide what's locked into the log board vs. still
  // "in progress" in the field diagram above it).
  const currentPA = !gv.finished ? pitchLog[gv.paIndex] : null;
  let revealedHalfInnings = 0;
  if (currentPA) {
    revealedHalfInnings = log.findIndex(h => h.inning === currentPA.inning && h.half === currentPA.half);
    if (revealedHalfInnings < 0) revealedHalfInnings = totalHalves;
  } else {
    revealedHalfInnings = totalHalves;
  }
  gv.revealedHalfInnings = revealedHalfInnings;

  const lastCompletedPA = gv.paIndex > 0 ? pitchLog[gv.paIndex - 1] : null;
  const shownScore = lastCompletedPA ? lastCompletedPA.scoreAfter : { home: 0, away: 0 };
  card.appendChild(el("div", { class: "stat-strip" }, [
    statBox(result.awayTeam.name.split(" ").pop(), shownScore.away),
    statBox(result.homeTeam.name.split(" ").pop(), shownScore.home)
  ]));
  const userTeamId = STATE.player && (STATE.player.teamId || STATE.player.orgId);
  const liveOpponent = result.homeTeam.id === userTeamId ? result.awayTeam : result.homeTeam;
  if (liveOpponent) card.appendChild(renderH2HCard(liveOpponent, true));
  card.appendChild(renderLineScoreTable(result, revealedHalfInnings));

  // Live field snapshot: the plate appearance currently being played out.
  if (!gv.finished && currentPA) {
    const currentHalf = log[revealedHalfInnings] || log[log.length - 1];
    card.appendChild(renderFieldDiagram(currentHalf, currentPA, result, gv));
  }

  const boardWrap = el("div", { style: "margin-top:14px;" });
  for (let i = 0; i < revealedHalfInnings; i++) {
    const half = log[i];
    const inningCard = el("div", { style: "margin-bottom:10px;" });
    inningCard.appendChild(el("h3", {}, `${half.half === "top" ? "Top" : "Bottom"} ${half.inning}${half.runsThisHalf > 0 ? ` — ${half.runsThisHalf} run${half.runsThisHalf > 1 ? "s" : ""}` : ""}`));
    const subsThisHalf = (result.game.subs || []).filter(s => s.inning === half.inning && s.half === half.half);
    for (const sub of subsThisHalf) inningCard.appendChild(el("div", { class: "log-line", style: "color:var(--amber);" }, sub.description));
    if (half.plays.length) {
      for (const line of half.plays) inningCard.appendChild(el("div", { class: "log-line" }, line));
    } else {
      inningCard.appendChild(el("div", { class: "log-line" }, "(no plate appearances recorded)"));
    }
    boardWrap.appendChild(inningCard);
  }
  // Plays already resolved within the CURRENT (not-yet-locked) half-inning,
  // so completed at-bats don't disappear while later ones in the same
  // half-inning are still being played out pitch by pitch.
  if (!gv.finished && currentPA) {
    const currentHalf = log[revealedHalfInnings];
    if (currentHalf) {
      const paInHalfSoFar = pitchLog.slice(0, gv.paIndex).filter(x => x.inning === currentHalf.inning && x.half === currentHalf.half);
      if (paInHalfSoFar.length) {
        const inProgressCard = el("div", { style: "margin-bottom:10px;" });
        inProgressCard.appendChild(el("h3", {}, `${currentHalf.half === "top" ? "Top" : "Bottom"} ${currentHalf.inning}`));
        for (const pa of paInHalfSoFar) {
          inProgressCard.appendChild(el("div", { class: "log-line" }, describePAResult(pa.batter, pa.result, pa.runsScored, pa.outsAfter)));
        }
        boardWrap.appendChild(inProgressCard);
      }
    }
  }
  card.appendChild(boardWrap);

  const btnRow = el("div", { class: "btn-row" });
  if (!gv.finished) {
    const pitchesThrown = gv.pitchIndex;
    const pitchesTotal = currentPA ? currentPA.pitches.length : 0;
    const isMidPitch = pitchesThrown < pitchesTotal;
    btnRow.appendChild(el("button", {
      class: "btn amber",
      onclick: () => advanceGamePitch()
    }, isMidPitch ? "Next Pitch →" : "Result →"));
    btnRow.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => { GAME_VIEW.paIndex = totalPAs; GAME_VIEW.animPhase = null; GAME_VIEW.finished = true; renderAll(); }
    }, "Sim Rest of Game"));
  } else {
    const winnerName = result.winner.name;
    card.appendChild(el("p", { class: "small-note", style: "margin-top:10px;" }, `Final: ${result.awayTeam.name} ${result.awayScore} — ${result.homeTeam.name} ${result.homeScore}. ${winnerName} win.`));
    btnRow.appendChild(el("button", {
      class: "btn amber",
      onclick: () => { GAME_VIEW.stage = "final"; renderAll(); }
    }, "View Final Lineups →"));
  }
  card.appendChild(btnRow);
  return card;
}

// Advances the live game by exactly one step: either reveals the next pitch
// of the current at-bat (with a throw/swing animation), or - once every
// pitch of the at-bat has been shown - resolves the at-bat's outcome and
// moves on to the next plate appearance.
function advanceGamePitch() {
  const gv = GAME_VIEW;
  if (!gv) return;
  const pitchLog = gv.result.game.pitchLog || [];
  const currentPA = pitchLog[gv.paIndex];
  if (!currentPA) { gv.finished = true; renderAll(); return; }

  if (gv.pitchIndex < currentPA.pitches.length) {
    gv.pitchIndex++;
    gv.animPhase = "pitching";
    renderAll();
    // Let the wind-up/throw/swing animation play out, then settle before
    // the next click is meaningful again (mirrors a real pitch's pacing).
    setTimeout(() => {
      if (GAME_VIEW === gv) { gv.animPhase = "settled"; renderAll(); }
    }, 650);
  } else {
    gv.animPhase = "outcome";
    gv.paIndex++;
    gv.pitchIndex = 0;
    renderAll();
    setTimeout(() => {
      if (GAME_VIEW === gv) { gv.animPhase = null; renderAll(); }
    }, 900);
  }
}

// Renders an SVG diamond with runners on base, the pitcher/batter dots
// (animated on each pitch thrown), the current batter/pitcher, the
// ball-strike count, and the last-pitch speed/type. `gv` (the live
// GAME_VIEW) drives which animation phase to show: a throw as gv.pitchIndex
// pitches have been revealed, a swing/take following it, and — once the PA's
// pitches run out — a flashed outcome banner (K, BB, hit, HR, out).
function renderFieldDiagram(currentHalf, currentPA, result, gv) {
  const box = el("div", { class: "field-diagram-wrap" });
  const isOutcomePhase = gv && gv.animPhase === "outcome";
  // Bases/outs as they stood entering this PA (i.e. before it's resolved):
  // approximate with basesAfter of the previous PA in this half if available.
  const pitchLog = result.game.pitchLog || [];
  const paIdx = pitchLog.indexOf(currentPA);
  const prevPA = paIdx > 0 ? pitchLog[paIdx - 1] : null;
  const prevSameHalf = prevPA && prevPA.inning === currentPA.inning && prevPA.half === currentPA.half ? prevPA : null;
  const displayBases = isOutcomePhase ? currentPA.basesAfter : (prevSameHalf ? prevSameHalf.basesAfter : [null, null, null]);
  const displayOuts = isOutcomePhase ? currentPA.outsAfter : (prevSameHalf ? prevSameHalf.outsAfter : 0);
  const p = STATE.player;

  // SVG diamond: home at bottom, 1B right, 2B top, 3B left.
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "field-diagram");
  const diamondPts = "100,40 160,100 100,160 40,100";
  const diamond = document.createElementNS(NS, "polygon");
  diamond.setAttribute("points", diamondPts);
  diamond.setAttribute("class", "field-diamond");
  svg.appendChild(diamond);
  const baseCoords = { 1: [160, 100], 2: [100, 40], 3: [40, 100] }; // 1B, 2B, 3B
  for (const [num, [cx, cy]] of Object.entries(baseCoords)) {
    const occupied = displayBases[Number(num) - 1];
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", cx - 8); rect.setAttribute("y", cy - 8);
    rect.setAttribute("width", 16); rect.setAttribute("height", 16);
    rect.setAttribute("transform", `rotate(45 ${cx} ${cy})`);
    rect.setAttribute("class", occupied ? "base occupied" : "base");
    svg.appendChild(rect);
  }
  const home = document.createElementNS(NS, "rect");
  home.setAttribute("x", 92); home.setAttribute("y", 152); home.setAttribute("width", 16); home.setAttribute("height", 16);
  home.setAttribute("transform", "rotate(45 100 160)");
  home.setAttribute("class", "base home");
  svg.appendChild(home);

  // Pitcher on the mound - nudges up/down on a throw.
  const isThrowing = gv && gv.animPhase === "pitching";
  const moundGroup = document.createElementNS(NS, "g");
  if (isThrowing) moundGroup.setAttribute("class", "pitcher-wind");
  const mound = document.createElementNS(NS, "circle");
  mound.setAttribute("cx", 100); mound.setAttribute("cy", 108); mound.setAttribute("r", 6);
  mound.setAttribute("class", "mound");
  moundGroup.appendChild(mound);
  const pitcherDot = document.createElementNS(NS, "circle");
  pitcherDot.setAttribute("cx", 100); pitcherDot.setAttribute("cy", 108); pitcherDot.setAttribute("r", 4);
  pitcherDot.setAttribute("class", "pitcher-dot");
  moundGroup.appendChild(pitcherDot);
  svg.appendChild(moundGroup);

  // Batter's box dot near home plate.
  const batterDot = document.createElementNS(NS, "circle");
  batterDot.setAttribute("cx", 116); batterDot.setAttribute("cy", 150); batterDot.setAttribute("r", 4);
  batterDot.setAttribute("class", "batter-dot");
  svg.appendChild(batterDot);

  // The pitch itself: a small ball that flies from the mound toward the
  // plate whenever a new pitch is thrown (re-triggered each render by
  // recreating the element, since CSS animations only replay on insertion).
  if (isThrowing) {
    const ball = document.createElementNS(NS, "circle");
    ball.setAttribute("cx", 100); ball.setAttribute("cy", 108); ball.setAttribute("r", 3.5);
    ball.setAttribute("class", "pitch-ball throwing");
    svg.appendChild(ball);
  }

  // Bat swing flash near the batter's box, timed to land just after the
  // pitch arrives (see .bat-swing animation-delay in CSS).
  if (isThrowing) {
    const bat = document.createElementNS(NS, "line");
    bat.setAttribute("x1", 116); bat.setAttribute("y1", 150);
    bat.setAttribute("x2", 132); bat.setAttribute("y2", 150);
    bat.setAttribute("stroke", "var(--chalk)");
    bat.setAttribute("stroke-width", "3");
    bat.setAttribute("stroke-linecap", "round");
    bat.setAttribute("class", "bat-swing swinging");
    svg.appendChild(bat);
  }

  box.appendChild(svg);

  const infoWrap = el("div", { style: "min-width:160px;" });

  // Outcome banner - flashes the plate appearance's result once its pitches
  // have all been shown.
  if (isOutcomePhase) {
    const r = currentPA.result;
    const kind = r === "HR" ? "hr" : r === "BB" ? "bb" : (r === "SO" || r === "OUT") ? "out" : "hit";
    const label = describePAResult(currentPA.batter, r, currentPA.runsScored, currentPA.outsAfter);
    infoWrap.appendChild(el("div", { class: `pa-outcome-flash ${kind} show` }, label));
  }

  const info = el("div", { class: "field-info" });
  const battingLabel = currentPA ? currentPA.batter.name : "—";
  const pitchingLabel = currentPA ? currentPA.pitcher.name : "—";
  const isBatterUser = p && currentPA && currentPA.batter.id === p.id;
  const isPitcherUser = p && currentPA && currentPA.pitcher.id === p.id;
  info.appendChild(el("div", { class: "field-info-row" }, [
    el("span", { class: "field-info-lbl" }, "At Bat"),
    el("span", { style: isBatterUser ? "color:var(--amber);font-weight:700;" : "" }, battingLabel + (isBatterUser ? " (You)" : ""))
  ]));
  info.appendChild(el("div", { class: "field-info-row" }, [
    el("span", { class: "field-info-lbl" }, "Pitching"),
    el("span", { style: isPitcherUser ? "color:var(--amber);font-weight:700;" : "" }, pitchingLabel + (isPitcherUser ? " (You)" : ""))
  ]));
  const pitchesShown = gv ? gv.pitchIndex : (currentPA ? currentPA.pitches.length : 0);
  const lastPitch = currentPA && currentPA.pitches && pitchesShown > 0 ? currentPA.pitches[pitchesShown - 1] : null;
  if (lastPitch) {
    info.appendChild(el("div", { class: "field-info-row" }, [
      el("span", { class: "field-info-lbl" }, "Count"),
      el("span", {}, `${lastPitch.balls}-${lastPitch.strikes}`)
    ]));
    info.appendChild(el("div", { class: "field-info-row" }, [
      el("span", { class: "field-info-lbl" }, "Pitch"),
      el("span", {}, `${lastPitch.type}, ${lastPitch.mph} mph`)
    ]));
  } else {
    info.appendChild(el("div", { class: "field-info-row" }, [
      el("span", { class: "field-info-lbl" }, "Count"),
      el("span", {}, "0-0")
    ]));
  }
  info.appendChild(el("div", { class: "field-info-row" }, [
    el("span", { class: "field-info-lbl" }, "Outs"),
    el("span", {}, String(displayOuts))
  ]));
  infoWrap.appendChild(info);
  box.appendChild(infoWrap);
  return box;
}


function renderGameDayView() {
  const gv = GAME_VIEW;
  const wrap = el("div");
  if (!gv) {
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Game Day"),
      el("p", { class: "small-note" }, "No game in progress.")
    ]));
    return wrap;
  }
  if (gv.stage === "lineups") wrap.appendChild(renderStartingLineupsCard(gv));
  else if (gv.stage === "live") wrap.appendChild(renderLiveGameCard(gv));
  else wrap.appendChild(renderFinalLineupsCard(gv));
  return wrap;
}

// ---- Stage 1: Starting Lineups ----
function renderStartingLineupsCard(gv) {
  const { result } = gv;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, `${result.awayTeam.name} @ ${result.homeTeam.name}`));
  card.appendChild(el("p", { class: "small-note" }, `${TEAM_NAME(result.homeTeam.id)} — ${stadiumCapacity((result.homeTeam.stadium || ""))} capacity · Starting lineups below.`));

  const grid = el("div", { class: "grid-2" });
  grid.appendChild(lineupColumn(result.awayTeam, result.awayLineup, result.awayStartingPitcher, STATE.player));
  grid.appendChild(lineupColumn(result.homeTeam, result.homeLineup, result.homeStartingPitcher, STATE.player));
  card.appendChild(grid);

  const btnRow = el("div", { class: "btn-row" });
  btnRow.appendChild(el("button", {
    class: "btn amber",
    onclick: () => { GAME_VIEW.stage = "live"; renderAll(); }
  }, "Play Ball →"));
  card.appendChild(btnRow);
  return card;
}

function lineupColumn(team, lineupInfo, startingPitcher, userPlayer) {
  const box = el("div");
  box.appendChild(el("h3", {}, team.name));
  box.appendChild(el("p", { class: "small-note" }, `Manager: ${lineupInfo.coach.name} — ${lineupInfo.coach.personality} (${COACH_PERSONALITIES[lineupInfo.coach.personality].desc})`));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["#", "Pos", "Player", "OVR"].map(h => el("th", {}, h))));
  for (const slot of lineupInfo.order) {
    const isUser = userPlayer && slot.player.id === userPlayer.id;
    table.appendChild(el("tr", { style: isUser ? "color:var(--amber);font-weight:700;" : "" }, [
      el("td", {}, String(slot.battingOrder)),
      el("td", {}, slot.position),
      el("td", {}, slot.player.name + (isUser ? " (You)" : "")),
      el("td", {}, String(battingOverall(slot.player)))
    ]));
  }
  box.appendChild(table);
  const isUserPitching = userPlayer && startingPitcher.id === userPlayer.id;
  box.appendChild(el("p", { class: "small-note", style: isUserPitching ? "color:var(--amber);font-weight:700;" : "" }, `Starting Pitcher: ${startingPitcher.name}${isUserPitching ? " (You)" : ""} — OVR ${pitchingOverall(startingPitcher)}`));
  return box;
}

// Renders a classic line-score table: away/home team names down the side,
// innings 1-9 (or more, for extras) across the top, plus R/H/E totals.
// `revealedHalves` optionally caps it to only the half-innings played so
// far (for the live view, so it doesn't spoil unplayed innings); omit it
// to show the full completed game (final view).
function renderLineScoreTable(result, revealedHalves) {
  const log = revealedHalves != null ? result.game.log.slice(0, revealedHalves) : result.game.log;
  const partialGame = { ...result.game, log };
  const ls = buildLineScore(partialGame);
  const table = el("table", { class: "stat-table linescore" });
  const headRow = el("tr", {}, [
    el("th", {}, ""),
    ...ls.innings.map(n => el("th", {}, String(n))),
    el("th", {}, "R"), el("th", {}, "H"), el("th", {}, "E")
  ]);
  table.appendChild(headRow);
  const rowFor = (label, side) => el("tr", {}, [
    el("td", { style: "text-align:left;font-weight:600;" }, label),
    ...side.byInning.map(v => el("td", {}, v == null ? "" : String(v))),
    el("td", { style: "font-weight:700;" }, String(side.R)),
    el("td", {}, String(side.H)),
    el("td", {}, String(side.E))
  ]);
  table.appendChild(rowFor(result.awayTeam.name.split(" ").pop(), ls.away));
  table.appendChild(rowFor(result.homeTeam.name.split(" ").pop(), ls.home));
  return table;
}

// ---- Stage 2: Live field view (pitch-by-pitch) ----
// Plays the game one pitch at a time instead of one half-inning at a time.
// gv.paIndex walks through result.game.pitchLog (one entry per plate
// appearance, each already holding its full pitch sequence). gv.pitchIndex
// tracks how many of the CURRENT PA's pitches have been thrown. Once a PA's
// pitches are exhausted, "Next Pitch" reveals that PA's outcome and (if it
// closed out the half-inning) locks the half-inning into the log board below,
// mirroring exactly what the old half-inning-at-a-time view showed, just
// arrived at one pitch at a time.
function renderLiveGameCard(gv) {
  const { result } = gv;
  const log = result.game.log || [];
  const pitchLog = result.game.pitchLog || [];
  const totalHalves = log.length;
  const totalPAs = pitchLog.length;
  gv.paIndex = Math.min(gv.paIndex, totalPAs);
  if (gv.paIndex >= totalPAs) { gv.finished = true; }

  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, `${result.awayTeam.name} @ ${result.homeTeam.name}`));

  // How many half-innings are FULLY complete given how many PAs we've played
  // through live (used to decide what's locked into the log board vs. still
  // "in progress" in the field diagram above it).
  const currentPA = !gv.finished ? pitchLog[gv.paIndex] : null;
  let revealedHalfInnings = 0;
  if (currentPA) {
    revealedHalfInnings = log.findIndex(h => h.inning === currentPA.inning && h.half === currentPA.half);
    if (revealedHalfInnings < 0) revealedHalfInnings = totalHalves;
  } else {
    revealedHalfInnings = totalHalves;
  }
  gv.revealedHalfInnings = revealedHalfInnings;

  const lastCompletedPA = gv.paIndex > 0 ? pitchLog[gv.paIndex - 1] : null;
  const shownScore = lastCompletedPA ? lastCompletedPA.scoreAfter : { home: 0, away: 0 };
  card.appendChild(el("div", { class: "stat-strip" }, [
    statBox(result.awayTeam.name.split(" ").pop(), shownScore.away),
    statBox(result.homeTeam.name.split(" ").pop(), shownScore.home)
  ]));
  card.appendChild(renderLineScoreTable(result, revealedHalfInnings));

  // Live field snapshot: the plate appearance currently being played out.
  if (!gv.finished && currentPA) {
    const currentHalf = log[revealedHalfInnings] || log[log.length - 1];
    card.appendChild(renderFieldDiagram(currentHalf, currentPA, result, gv));
  }

  const boardWrap = el("div", { style: "margin-top:14px;" });
  for (let i = 0; i < revealedHalfInnings; i++) {
    const half = log[i];
    const inningCard = el("div", { style: "margin-bottom:10px;" });
    inningCard.appendChild(el("h3", {}, `${half.half === "top" ? "Top" : "Bottom"} ${half.inning}${half.runsThisHalf > 0 ? ` — ${half.runsThisHalf} run${half.runsThisHalf > 1 ? "s" : ""}` : ""}`));
    const subsThisHalf = (result.game.subs || []).filter(s => s.inning === half.inning && s.half === half.half);
    for (const sub of subsThisHalf) inningCard.appendChild(el("div", { class: "log-line", style: "color:var(--amber);" }, sub.description));
    if (half.plays.length) {
      for (const line of half.plays) inningCard.appendChild(el("div", { class: "log-line" }, line));
    } else {
      inningCard.appendChild(el("div", { class: "log-line" }, "(no plate appearances recorded)"));
    }
    boardWrap.appendChild(inningCard);
  }
  // Plays already resolved within the CURRENT (not-yet-locked) half-inning,
  // so completed at-bats don't disappear while later ones in the same
  // half-inning are still being played out pitch by pitch.
  if (!gv.finished && currentPA) {
    const currentHalf = log[revealedHalfInnings];
    if (currentHalf) {
      const paInHalfSoFar = pitchLog.slice(0, gv.paIndex).filter(x => x.inning === currentHalf.inning && x.half === currentHalf.half);
      if (paInHalfSoFar.length) {
        const inProgressCard = el("div", { style: "margin-bottom:10px;" });
        inProgressCard.appendChild(el("h3", {}, `${currentHalf.half === "top" ? "Top" : "Bottom"} ${currentHalf.inning}`));
        for (const pa of paInHalfSoFar) {
          inProgressCard.appendChild(el("div", { class: "log-line" }, describePAResult(pa.batter, pa.result, pa.runsScored, pa.outsAfter)));
        }
        boardWrap.appendChild(inProgressCard);
      }
    }
  }
  card.appendChild(boardWrap);

  const btnRow = el("div", { class: "btn-row" });
  if (!gv.finished) {
    const pitchesThrown = gv.pitchIndex;
    const pitchesTotal = currentPA ? currentPA.pitches.length : 0;
    const isMidPitch = pitchesThrown < pitchesTotal;
    btnRow.appendChild(el("button", {
      class: "btn amber",
      onclick: () => advanceGamePitch()
    }, isMidPitch ? "Next Pitch →" : "Result →"));
    btnRow.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => { GAME_VIEW.paIndex = totalPAs; GAME_VIEW.animPhase = null; GAME_VIEW.finished = true; renderAll(); }
    }, "Sim Rest of Game"));
  } else {
    const winnerName = result.winner.name;
    card.appendChild(el("p", { class: "small-note", style: "margin-top:10px;" }, `Final: ${result.awayTeam.name} ${result.awayScore} — ${result.homeTeam.name} ${result.homeScore}. ${winnerName} win.`));
    btnRow.appendChild(el("button", {
      class: "btn amber",
      onclick: () => { GAME_VIEW.stage = "final"; renderAll(); }
    }, "View Final Lineups →"));
  }
  card.appendChild(btnRow);
  return card;
}

// Advances the live game by exactly one step: either reveals the next pitch
// of the current at-bat (with a throw/swing animation), or - once every
// pitch of the at-bat has been shown - resolves the at-bat's outcome and
// moves on to the next plate appearance.
function advanceGamePitch() {
  const gv = GAME_VIEW;
  if (!gv) return;
  const pitchLog = gv.result.game.pitchLog || [];
  const currentPA = pitchLog[gv.paIndex];
  if (!currentPA) { gv.finished = true; renderAll(); return; }

  if (gv.pitchIndex < currentPA.pitches.length) {
    gv.pitchIndex++;
    gv.animPhase = "pitching";
    renderAll();
    // Let the wind-up/throw/swing animation play out, then settle before
    // the next click is meaningful again (mirrors a real pitch's pacing).
    setTimeout(() => {
      if (GAME_VIEW === gv) { gv.animPhase = "settled"; renderAll(); }
    }, 650);
  } else {
    gv.animPhase = "outcome";
    gv.paIndex++;
    gv.pitchIndex = 0;
    renderAll();
    setTimeout(() => {
      if (GAME_VIEW === gv) { gv.animPhase = null; renderAll(); }
    }, 900);
  }
}

// Renders an SVG diamond with runners on base, the pitcher/batter dots
// (animated on each pitch thrown), the current batter/pitcher, the
// ball-strike count, and the last-pitch speed/type. `gv` (the live
// GAME_VIEW) drives which animation phase to show: a throw as gv.pitchIndex
// pitches have been revealed, a swing/take following it, and — once the PA's
// pitches run out — a flashed outcome banner (K, BB, hit, HR, out).
function renderFieldDiagram(currentHalf, currentPA, result, gv) {
  const box = el("div", { class: "field-diagram-wrap" });
  const isOutcomePhase = gv && gv.animPhase === "outcome";
  // Bases/outs as they stood entering this PA (i.e. before it's resolved):
  // approximate with basesAfter of the previous PA in this half if available.
  const pitchLog = result.game.pitchLog || [];
  const paIdx = pitchLog.indexOf(currentPA);
  const prevPA = paIdx > 0 ? pitchLog[paIdx - 1] : null;
  const prevSameHalf = prevPA && prevPA.inning === currentPA.inning && prevPA.half === currentPA.half ? prevPA : null;
  const displayBases = isOutcomePhase ? currentPA.basesAfter : (prevSameHalf ? prevSameHalf.basesAfter : [null, null, null]);
  const displayOuts = isOutcomePhase ? currentPA.outsAfter : (prevSameHalf ? prevSameHalf.outsAfter : 0);
  const p = STATE.player;

  // SVG diamond: home at bottom, 1B right, 2B top, 3B left.
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "field-diagram");
  const diamondPts = "100,40 160,100 100,160 40,100";
  const diamond = document.createElementNS(NS, "polygon");
  diamond.setAttribute("points", diamondPts);
  diamond.setAttribute("class", "field-diamond");
  svg.appendChild(diamond);
  const baseCoords = { 1: [160, 100], 2: [100, 40], 3: [40, 100] }; // 1B, 2B, 3B
  for (const [num, [cx, cy]] of Object.entries(baseCoords)) {
    const occupied = displayBases[Number(num) - 1];
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", cx - 8); rect.setAttribute("y", cy - 8);
    rect.setAttribute("width", 16); rect.setAttribute("height", 16);
    rect.setAttribute("transform", `rotate(45 ${cx} ${cy})`);
    rect.setAttribute("class", occupied ? "base occupied" : "base");
    svg.appendChild(rect);
  }
  const home = document.createElementNS(NS, "rect");
  home.setAttribute("x", 92); home.setAttribute("y", 152); home.setAttribute("width", 16); home.setAttribute("height", 16);
  home.setAttribute("transform", "rotate(45 100 160)");
  home.setAttribute("class", "base home");
  svg.appendChild(home);

  // Pitcher on the mound - nudges up/down on a throw.
  const isThrowing = gv && gv.animPhase === "pitching";
  const moundGroup = document.createElementNS(NS, "g");
  if (isThrowing) moundGroup.setAttribute("class", "pitcher-wind");
  const mound = document.createElementNS(NS, "circle");
  mound.setAttribute("cx", 100); mound.setAttribute("cy", 108); mound.setAttribute("r", 6);
  mound.setAttribute("class", "mound");
  moundGroup.appendChild(mound);
  const pitcherDot = document.createElementNS(NS, "circle");
  pitcherDot.setAttribute("cx", 100); pitcherDot.setAttribute("cy", 108); pitcherDot.setAttribute("r", 4);
  pitcherDot.setAttribute("class", "pitcher-dot");
  moundGroup.appendChild(pitcherDot);
  svg.appendChild(moundGroup);

  // Batter's box dot near home plate.
  const batterDot = document.createElementNS(NS, "circle");
  batterDot.setAttribute("cx", 116); batterDot.setAttribute("cy", 150); batterDot.setAttribute("r", 4);
  batterDot.setAttribute("class", "batter-dot");
  svg.appendChild(batterDot);

  // The pitch itself: a small ball that flies from the mound toward the
  // plate whenever a new pitch is thrown (re-triggered each render by
  // recreating the element, since CSS animations only replay on insertion).
  if (isThrowing) {
    const ball = document.createElementNS(NS, "circle");
    ball.setAttribute("cx", 100); ball.setAttribute("cy", 108); ball.setAttribute("r", 3.5);
    ball.setAttribute("class", "pitch-ball throwing");
    svg.appendChild(ball);
  }

  // Bat swing flash near the batter's box, timed to land just after the
  // pitch arrives (see .bat-swing animation-delay in CSS).
  if (isThrowing) {
    const bat = document.createElementNS(NS, "line");
    bat.setAttribute("x1", 116); bat.setAttribute("y1", 150);
    bat.setAttribute("x2", 132); bat.setAttribute("y2", 150);
    bat.setAttribute("stroke", "var(--chalk)");
    bat.setAttribute("stroke-width", "3");
    bat.setAttribute("stroke-linecap", "round");
    bat.setAttribute("class", "bat-swing swinging");
    svg.appendChild(bat);
  }

  box.appendChild(svg);

  const infoWrap = el("div", { style: "min-width:160px;" });

  // Outcome banner - flashes the plate appearance's result once its pitches
  // have all been shown.
  if (isOutcomePhase) {
    const r = currentPA.result;
    const kind = r === "HR" ? "hr" : r === "BB" ? "bb" : (r === "SO" || r === "OUT") ? "out" : "hit";
    const label = describePAResult(currentPA.batter, r, currentPA.runsScored, currentPA.outsAfter);
    infoWrap.appendChild(el("div", { class: `pa-outcome-flash ${kind} show` }, label));
  }

  const info = el("div", { class: "field-info" });
  const battingLabel = currentPA ? currentPA.batter.name : "—";
  const pitchingLabel = currentPA ? currentPA.pitcher.name : "—";
  const isBatterUser = p && currentPA && currentPA.batter.id === p.id;
  const isPitcherUser = p && currentPA && currentPA.pitcher.id === p.id;
  info.appendChild(el("div", { class: "field-info-row" }, [
    el("span", { class: "field-info-lbl" }, "At Bat"),
    el("span", { style: isBatterUser ? "color:var(--amber);font-weight:700;" : "" }, battingLabel + (isBatterUser ? " (You)" : ""))
  ]));
  info.appendChild(el("div", { class: "field-info-row" }, [
    el("span", { class: "field-info-lbl" }, "Pitching"),
    el("span", { style: isPitcherUser ? "color:var(--amber);font-weight:700;" : "" }, pitchingLabel + (isPitcherUser ? " (You)" : ""))
  ]));
  const pitchesShown = gv ? gv.pitchIndex : (currentPA ? currentPA.pitches.length : 0);
  const lastPitch = currentPA && currentPA.pitches && pitchesShown > 0 ? currentPA.pitches[pitchesShown - 1] : null;
  if (lastPitch) {
    info.appendChild(el("div", { class: "field-info-row" }, [
      el("span", { class: "field-info-lbl" }, "Count"),
      el("span", {}, `${lastPitch.balls}-${lastPitch.strikes}`)
    ]));
    info.appendChild(el("div", { class: "field-info-row" }, [
      el("span", { class: "field-info-lbl" }, "Pitch"),
      el("span", {}, `${lastPitch.type}, ${lastPitch.mph} mph`)
    ]));
  } else {
    info.appendChild(el("div", { class: "field-info-row" }, [
      el("span", { class: "field-info-lbl" }, "Count"),
      el("span", {}, "0-0")
    ]));
  }
  info.appendChild(el("div", { class: "field-info-row" }, [
    el("span", { class: "field-info-lbl" }, "Outs"),
    el("span", {}, String(displayOuts))
  ]));
  infoWrap.appendChild(info);
  box.appendChild(infoWrap);
  return box;
}

// ---- Stage 3: Final Lineups (with every substitution that happened) ----
function renderFinalLineupsCard(gv) {
  const { result } = gv;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Final Lineups"));
  card.appendChild(el("p", { class: "small-note" }, `Final: ${result.awayTeam.name} ${result.awayScore} — ${result.homeTeam.name} ${result.homeScore}. ${result.winner.name} win.`));
  card.appendChild(renderLineScoreTable(result));
  card.appendChild(el("p", { class: "small-note" }, `W: ${result.winningPitcher.name} · L: ${result.losingPitcher.name}`));
  const userTeamId = STATE.player && (STATE.player.teamId || STATE.player.orgId);
  const finalOpponent = result.homeTeam.id === userTeamId ? result.awayTeam : result.homeTeam;
  if (finalOpponent) card.appendChild(renderH2HCard(finalOpponent, false));

  const potg = pickPlayerOfTheGame(result);
  if (potg) {
    const isUser = STATE.player && potg.player.id === STATE.player.id;
    const line = potg.kind === "batting"
      ? `${potg.line.H}-for-${potg.line.AB}, ${potg.line.R || 0} R, ${potg.line.RBI} RBI${potg.line.HR ? `, ${potg.line.HR} HR` : ""}`
      : `${(potg.line.outs / 3).toFixed(1)} IP, ${potg.line.SO} K, ${potg.line.ER} ER`;
    card.appendChild(el("div", { class: "card", style: "background:var(--panel-2, rgba(255,255,255,0.04));margin-top:8px;margin-bottom:8px;" }, [
      el("h3", { style: "margin:0 0 4px 0;" }, "⭐ Player of the Game"),
      el("p", { style: `margin:0;${isUser ? "color:var(--amber);font-weight:700;" : ""}` }, `${potg.player.name}${isUser ? " (You)" : ""} — ${line}`)
    ]));
  }

  const grid = el("div", { class: "grid-2" });
  grid.appendChild(finalLineupColumn(result.awayTeam, result.awayLineup, result.awayStartingPitcher, result.game.subs.filter(s => s.team === "away"), STATE.player, result.game, "away"));
  grid.appendChild(finalLineupColumn(result.homeTeam, result.homeLineup, result.homeStartingPitcher, result.game.subs.filter(s => s.team === "home"), STATE.player, result.game, "home"));
  card.appendChild(grid);

  const btnRow = el("div", { class: "btn-row" });
  btnRow.appendChild(el("button", {
    class: "btn amber",
    onclick: () => { GAME_VIEW = null; ACTIVE_TAB = "career"; renderAll(); }
  }, "Back to Career"));
  card.appendChild(btnRow);
  return card;
}

function finalLineupColumn(team, lineupInfo, startingPitcher, subs, userPlayer, game, side) {
  const box = el("div");
  box.appendChild(el("h3", {}, team.name));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["#", "Pos", "Player", "OVR", "AB", "R", "H", "RBI", "HR", "BB", "K", "AVG", "TOTALHR", "TOTALRBI"].map(h => el("th", {}, h))));
  const battingSubs = subs.filter(s => s.kind === "batting");
  for (const slot of lineupInfo.order) {
    const replacedBy = battingSubs.find(s => s.outPlayer.id === slot.player.id);
    const finalPlayer = replacedBy ? replacedBy.inPlayer : slot.player;
    const isUser = userPlayer && finalPlayer.id === userPlayer.id;
    // Combine the starter's and (if replaced) the sub's game lines into one
    // row, since either one may have batted/scored during the game.
    const startLine = game && game.lines.get(slot.player.id);
    const subLine = replacedBy && game ? game.lines.get(replacedBy.inPlayer.id) : null;
    const sum = (key) => (startLine ? startLine[key] || 0 : 0) + (subLine ? subLine[key] || 0 : 0);
    const AB = sum("AB"), R = sum("R"), H = sum("H"), RBI = sum("RBI"), HR = sum("HR"), BB = sum("BB"), K = sum("SO");
    const AVG = AB > 0 ? fmt3(H / AB) : fmt3(0);
    const totalHR = finalPlayer.seasonStats ? finalPlayer.seasonStats.batting.HR : HR;
    const totalRBI = finalPlayer.seasonStats ? finalPlayer.seasonStats.batting.RBI : RBI;
    table.appendChild(el("tr", { style: isUser ? "color:var(--amber);font-weight:700;" : "" }, [
      el("td", {}, String(slot.battingOrder)),
      el("td", {}, slot.position),
      el("td", {}, finalPlayer.name + (isUser ? " (You)" : "") + (replacedBy ? ` (for ${slot.player.name})` : "")),
      el("td", {}, String(battingOverall(finalPlayer))),
      el("td", {}, String(AB)),
      el("td", {}, String(R)),
      el("td", {}, String(H)),
      el("td", {}, String(RBI)),
      el("td", {}, String(HR)),
      el("td", {}, String(BB)),
      el("td", {}, String(K)),
      el("td", {}, AVG),
      el("td", {}, String(totalHR)),
      el("td", {}, String(totalRBI))
    ]));
  }
  box.appendChild(table);
  const lob = game && game.lob ? (game.lob[side] || 0) : 0;
  box.appendChild(el("p", { class: "small-note" }, `LOB: ${lob}`));

  const pitchingSubs = subs.filter(s => s.kind === "pitching");
  const finalPitcher = pitchingSubs.length ? pitchingSubs[pitchingSubs.length - 1].inPlayer : startingPitcher;
  const isUserPitching = userPlayer && finalPitcher.id === userPlayer.id;
  box.appendChild(el("p", { class: "small-note" }, `Starting Pitcher: ${startingPitcher.name} — OVR ${pitchingOverall(startingPitcher)}`));
  if (pitchingSubs.length) {
    box.appendChild(el("p", { class: "small-note", style: isUserPitching ? "color:var(--amber);font-weight:700;" : "" }, `Finished on the mound: ${finalPitcher.name}${isUserPitching ? " (You)" : ""} — OVR ${pitchingOverall(finalPitcher)}`));
  }
  if (subs.length) {
    const subList = el("div", { style: "margin-top:6px;" });
    for (const s of subs) subList.appendChild(el("div", { class: "log-line" }, `${s.half === "top" ? "Top" : "Bot"} ${s.inning}: ${s.description}`));
    box.appendChild(subList);
  }
  return box;
}


function summarizeResults(results) {
  return results.slice(0, 12).map(r => `${r.awayTeam.name} ${r.awayScore} @ ${r.homeTeam.name} ${r.homeScore} — ${r.winner.name} win`);
}

function checkPromotion() {
  const p = STATE.player;
  if (!p || p.retired) return;
  if (MINOR_LEVELS.includes(p.level)) {
    const ov = overallRating(p);
    const idx = MINOR_LEVELS.indexOf(p.level);
    if (ov > 55 + idx * 8 && Math.random() < 0.05) {
      const next = MINOR_LEVELS[idx + 1];
      if (next) {
        removeFromCurrentRoster(STATE, p);
        assignToMinorTeam(STATE, p, next, p.orgId);
        // Re-sign at the new level's pay scale — a promotion without a new
        // contract would leave a player earning Rookie-ball wages all the
        // way up through Triple-A.
        p.contract = generateContract(p, next, p.contract ? p.contract.years : 1);
        addNews(STATE, `PROMOTED! ${p.name} moves up to ${next} (${TEAM_NAME(p.teamId)}, ${STATE.teams[p.teamId].minorLeagueName}).`);
        toast(`Promoted to ${next}!`);
      }
      else if (idx === MINOR_LEVELS.length - 1) {
        const org = ALL_PRO_TEAMS.find(t => t.id === p.orgId);
        removeFromCurrentRoster(STATE, p);
        p.level = org ? org.league : "MLB";
        p.teamId = p.orgId;
        const team = STATE.teams[p.teamId];
        if (team) team.roster.push(p);
        // Call-up to the majors/NPB/KBO: sign a new pro contract at the
        // big-league pay scale instead of leaving the old Minor League
        // Contract in place.
        p.contract = generateContract(p, p.level, 2);
        addNews(STATE, `CALL-UP! ${p.name} has been called up to the big leagues with the ${TEAM_NAME(p.teamId)}! New contract: $${p.contract.salary}M/yr.`);
        toast(`${p.name} called up to ${p.level}! Signed a new $${p.contract.salary}M/yr contract.`);
      }
    }
  }
}

function renderRecentLog() {
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Recent Results"));
  if (!LAST_GAME_LOGS.length) card.appendChild(el("p", { class: "small-note" }, "Simulate some time to see league results here."));
  for (const line of LAST_GAME_LOGS) card.appendChild(el("div", { class: "log-line" }, line));
  return card;
}

// ---- Attributes ----
function renderAttributeCard(p) {
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Player Attributes"));
  const grid = el("div", { class: "grid-2" });
  const battingBox = el("div");
  battingBox.appendChild(el("h3", {}, "Batting"));
  for (const [k, v] of Object.entries(p.batting)) battingBox.appendChild(attrBar(k, v));
  const fieldBox = el("div");
  fieldBox.appendChild(el("h3", {}, "Fielding"));
  for (const [k, v] of Object.entries(p.fielding)) fieldBox.appendChild(attrBar(k, v));
  grid.appendChild(battingBox); grid.appendChild(fieldBox);
  card.appendChild(grid);
  if (isPitcher(p.position)) {
    const pitchBox = el("div");
    pitchBox.appendChild(el("h3", {}, "Pitching"));
    for (const [k, v] of Object.entries(p.pitching)) pitchBox.appendChild(attrBar(k, v));
    pitchBox.appendChild(el("p", { class: "small-note" }, `Repertoire: ${p.pitchTypes.join(", ")}`));
    card.appendChild(pitchBox);
  }
  return card;
}
function attrBar(key, val) {
  const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
  const row = el("div", { class: "attr-bar-row" });
  row.appendChild(el("div", { class: "attr-bar-label" }, label));
  const track = el("div", { class: "attr-bar-track" });
  track.appendChild(el("div", { class: "attr-bar-fill", style: `width:${val}%` }));
  row.appendChild(track);
  row.appendChild(el("div", { class: "attr-bar-val" }, String(val)));
  return row;
}

