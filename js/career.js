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
    saveSlot: null
  };
}

function initLeagueTeams(state) {
  const built = [];
  for (const t of ALL_PRO_TEAMS) {
    const team = initTeam(t);
    generateRosterForTeam(team, LEAGUES[t.league].level * 15 + 15);
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
    case "Minors":
      p.level = "Rookie"; p.age = Math.max(p.age, 18);
      assignToMinorTeam(state, p, "Rookie");
      state.phase = "season";
      addNews(state, `${p.name} signs on and reports to Rookie ball.`);
      break;
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

function assignToMinorTeam(state, p, minorLevel) {
  // Attach to a random org's farm system (not a full separate team object; tracked via parent org)
  const org = pick(MLB_TEAMS);
  p.teamId = org.id;
  p.level = minorLevel;
  p.orgId = org.id;
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
    }
    t.roster = t.roster.filter(p => !p.retired);
    // Backfill roster with rookies if needed
    if (t.roster.length < 26) generateRosterForTeam(t, LEAGUES[t.league].level * 15 + 15);
    t.wins = 0; t.losses = 0;
  }
  if (state.player && !state.player.retired) {
    developPlayer(state.player);
    finalizeSeasonToCareer(state.player);
  }
  state.year++;
  state.day = 1;
  addNews(state, `The ${state.year - 1} season has concluded. Welcome to ${state.year}.`);
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
        addNews(STATE, `${p.name} went undrafted but signs a Minor League deal as a free agent.`);
        p.teamId = pick(MLB_TEAMS).id; p.orgId = p.teamId; p.level = "Rookie";
        p.contract = generateContract(p, "Rookie", 1);
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
    el("button", { class: "btn amber", onclick: () => { STATE.phase = "season"; ACTIVE_TAB = "career"; addNews(STATE, `${p.name} reports to ${p.level} ball with the ${TEAM_NAME(p.orgId)} organization.`); renderAll(); } }, "Report to Minor League Camp →")
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
function renderRosterView() {
  const p = STATE.player;
  const card = el("div", { class: "card" });
  const team = STATE.teams[p.teamId] || STATE.teams[p.orgId];
  card.appendChild(el("h2", {}, `Roster — ${team ? team.name : p.level}`));
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["Name", "Pos", "Age", "OVR", "Status"].map(h => el("th", {}, h))));
  const roster = team ? [...team.roster] : [p];
  if (team && !roster.find(r => r.id === p.id) && p.teamId === team.id) roster.push(p);
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
function renderStandingsView() {
  const wrap = el("div");
  for (const lg of ["MLB", "NPB", "KBO"]) {
    const card = el("div", { class: "card" });
    card.appendChild(el("h2", {}, lg + " Standings"));
    const teams = STATE.allTeams.filter(t => t.league === lg).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
    const table = el("table", { class: "stat-table" });
    table.appendChild(el("tr", {}, ["Team", "W", "L", "PCT"].map(h => el("th", {}, h))));
    for (const t of teams) {
      const pct = t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0;
      const isMine = STATE.player && (STATE.player.teamId === t.id);
      table.appendChild(el("tr", { class: isMine ? "user-row" : "" }, [
        el("td", {}, t.name), el("td", {}, String(t.wins)), el("td", {}, String(t.losses)), el("td", {}, fmt3(pct))
      ]));
    }
    card.appendChild(table);
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
  else if (tab === "career") { wrap.appendChild(renderPlayerCard(STATE.player)); wrap.appendChild(renderSimControls()); wrap.appendChild(renderRecentLog()); wrap.appendChild(renderAttributeCard(STATE.player)); }
  else if (tab === "roster") wrap.appendChild(renderRosterView());
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
  badges.appendChild(el("span", { class: "badge" }, `${p.level}${p.orgId ? " — " + TEAM_NAME(p.orgId) : ""}`));
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

// ---- Sim Controls ----
function renderSimControls() {
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Advance Career"));
  card.appendChild(el("p", { class: "small-note" }, `${STATE.year} Season — Day ${STATE.day}. Play today's game inning by inning, fast-sim a day/week/month, or promote/retire when eligible.`));
  const row = el("div", { class: "btn-row" });
  row.appendChild(el("button", { class: "btn amber", onclick: () => { startGameDay(); renderAll(); } }, "Play Today's Game →"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { LAST_GAME_LOGS = summarizeResults(simDay(STATE)); checkPromotion(); renderAll(); } }, "Sim Day"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { LAST_GAME_LOGS = summarizeResults(simWeek(STATE)); checkPromotion(); renderAll(); } }, "Sim Week"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { LAST_GAME_LOGS = summarizeResults(simMonth(STATE)); checkPromotion(); renderAll(); } }, "Sim Month"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { endSeasonRollover(STATE); LAST_GAME_LOGS = []; toast(`Season complete. Welcome to ${STATE.year}.`); renderAll(); } }, "End Season →"));
  card.appendChild(row);
  return card;
}

// ---- Game Day (inning-by-inning viewer) ----
// GAME_VIEW holds the transient state of "today's" tracked game so the
// player can step through it half-inning by half-inning, or jump straight
// to the final result ("Sim"). Lives only in memory - it never needs to
// be saved, since by the time you save/reload the day has already advanced.
let GAME_VIEW = null;

function startGameDay() {
  const { results, userGameResult } = simDayWithUserGame(STATE);
  LAST_GAME_LOGS = summarizeResults(results);
  checkPromotion();
  if (!userGameResult) {
    // Player has no team today (e.g. amateur/free agent/off day) - nothing to watch, just report the day.
    toast("No game scheduled for your team today.");
    GAME_VIEW = null;
    return;
  }
  GAME_VIEW = {
    result: userGameResult,
    revealedHalfInnings: 0, // how many entries of game.log are currently shown
    finished: false
  };
  ACTIVE_TAB = "gameday";
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
  const { result } = gv;
  const p = STATE.player;
  const isHome = p && (p.teamId === result.homeTeam.id || p.orgId === result.homeTeam.id);
  const log = result.game.log || [];
  const totalHalves = log.length;
  gv.revealedHalfInnings = Math.min(gv.revealedHalfInnings, totalHalves);
  if (gv.revealedHalfInnings >= totalHalves) gv.finished = true;

  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, `${result.awayTeam.name} @ ${result.homeTeam.name}`));

  const shownScore = gv.revealedHalfInnings > 0
    ? log[gv.revealedHalfInnings - 1].scoreAfter
    : { home: 0, away: 0 };
  card.appendChild(el("div", { class: "stat-strip" }, [
    statBox(result.awayTeam.name.split(" ").pop(), shownScore.away),
    statBox(result.homeTeam.name.split(" ").pop(), shownScore.home)
  ]));

  const boardWrap = el("div", { style: "margin-top:14px;" });
  for (let i = 0; i < gv.revealedHalfInnings; i++) {
    const half = log[i];
    const inningCard = el("div", { style: "margin-bottom:10px;" });
    inningCard.appendChild(el("h3", {}, `${half.half === "top" ? "Top" : "Bottom"} ${half.inning}${half.runsThisHalf > 0 ? ` — ${half.runsThisHalf} run${half.runsThisHalf > 1 ? "s" : ""}` : ""}`));
    if (half.plays.length) {
      for (const line of half.plays) inningCard.appendChild(el("div", { class: "log-line" }, line));
    } else {
      inningCard.appendChild(el("div", { class: "log-line" }, "(no plate appearances recorded)"));
    }
    boardWrap.appendChild(inningCard);
  }
  card.appendChild(boardWrap);

  const btnRow = el("div", { class: "btn-row" });
  if (!gv.finished) {
    btnRow.appendChild(el("button", {
      class: "btn amber",
      onclick: () => { GAME_VIEW.revealedHalfInnings++; renderAll(); }
    }, "Next Half-Inning →"));
    btnRow.appendChild(el("button", {
      class: "btn secondary",
      onclick: () => { GAME_VIEW.revealedHalfInnings = totalHalves; GAME_VIEW.finished = true; renderAll(); }
    }, "Sim Rest of Game"));
  } else {
    const winnerName = result.winner.name;
    card.appendChild(el("p", { class: "small-note", style: "margin-top:10px;" }, `Final: ${result.awayTeam.name} ${result.awayScore} — ${result.homeTeam.name} ${result.homeScore}. ${winnerName} win.`));
    btnRow.appendChild(el("button", {
      class: "btn amber",
      onclick: () => { GAME_VIEW = null; ACTIVE_TAB = "career"; renderAll(); }
    }, "Back to Career"));
  }
  card.appendChild(btnRow);
  wrap.appendChild(card);
  return wrap;
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
      if (next) { p.level = next; addNews(STATE, `PROMOTED! ${p.name} moves up to ${next}.`); toast(`Promoted to ${next}!`); }
      else if (idx === MINOR_LEVELS.length - 1) {
        const org = ALL_PRO_TEAMS.find(t => t.id === p.orgId);
        p.level = org ? org.league : "MLB";
        p.teamId = p.orgId;
        const team = STATE.teams[p.teamId];
        if (team) team.roster.push(p);
        addNews(STATE, `CALL-UP! ${p.name} has been called up to the big leagues with the ${TEAM_NAME(p.teamId)}!`);
        toast(`${p.name} called up to ${p.level}!`);
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

