// ============================================================
// DIAMOND LEGACY - CORE GAME SYSTEMS
// 10 foundational systems layered on top of the existing career sim.
// ============================================================

const CORE_AUTOSAVE_KEY = "diamond-legacy-autosave";
const CORE_BACKUP_KEY = "diamond-legacy-backup";
let CORE_AUTOSAVE_TIMER = null;
let CORE_LAST_AUTOSAVE = 0;
let CORE_DIRTY = false;

function ensureCoreSystems(state) {
  if (!state) return state;
  state.coreSystems ||= {};
  const c = state.coreSystems;
  c.version ||= 1;
  c.autosave ||= { enabled: true, intervalSec: 30, lastSavedAt: null, saveCount: 0, lastError: null };
  c.morale ||= {};
  c.teamChemistry ||= {};
  c.scouting ||= { reports: {}, lastReportDay: 0 };
  c.weather ||= {};
  c.milestones ||= { unlocked: [], recent: [] };
  c.notifications ||= [];
  c.gameHistory ||= [];
  c.settings ||= { difficulty: "Normal", autoAdvance: false, confirmImportantActions: true };
  return state;
}

function coreMarkDirty() { CORE_DIRTY = true; }

function coreNotify(title, message, type = "info") {
  if (!STATE) return;
  ensureCoreSystems(STATE);
  STATE.coreSystems.notifications.unshift({
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    day: STATE.day, year: STATE.year, title, message, type, read: false,
    createdAt: new Date().toISOString()
  });
  STATE.coreSystems.notifications = STATE.coreSystems.notifications.slice(0, 60);
  coreMarkDirty();
}

function coreCheckMilestones() {
  if (!STATE?.player) return;
  ensureCoreSystems(STATE);
  const p = STATE.player;
  const unlocked = new Set(STATE.coreSystems.milestones.unlocked || []);
  const candidates = [
    ["first-game", "First Game", "Played your first professional game.", (p.stats?.batting?.G || p.stats?.pitching?.G || 0) >= 1],
    ["first-hit", "First Hit", "Recorded your first hit.", (p.stats?.batting?.H || 0) >= 1],
    ["ten-hits", "10 Hits", "Reached 10 career hits.", (p.stats?.batting?.H || 0) >= 10],
    ["hundred-hits", "100 Hits", "Reached 100 career hits.", (p.stats?.batting?.H || 0) >= 100],
    ["ten-hr", "Power Arrives", "Reached 10 career home runs.", (p.stats?.batting?.HR || 0) >= 10],
    ["mlb-debut", "Major League Debut", "Reached the highest professional level.", PRO_LEAGUE_CODES.includes(p.level)],
    ["season-complete", "Season Complete", "Completed a full season.", (STATE.seasonRecap?.year || 0) >= 1]
  ];
  for (const [id, title, msg, ok] of candidates) {
    if (ok && !unlocked.has(id)) {
      unlocked.add(id);
      STATE.coreSystems.milestones.recent.unshift({ id, title, message: msg, year: STATE.year, day: STATE.day });
      coreNotify(`Milestone: ${title}`, msg, "milestone");
    }
  }
  STATE.coreSystems.milestones.unlocked = [...unlocked];
  STATE.coreSystems.milestones.recent = STATE.coreSystems.milestones.recent.slice(0, 12);
}

function coreUpdateMorale() {
  if (!STATE?.player) return;
  ensureCoreSystems(STATE);
  const p = STATE.player;
  const key = p.id || "user";
  let m = Number(STATE.coreSystems.morale[key]);
  if (!Number.isFinite(m)) m = 60;
  const fatigue = Number(p.fatigue || 0);
  const health = p.health?.status === "Healthy" ? 10 : -20;
  const fatiguePenalty = fatigue >= 85 ? -8 : fatigue >= 65 ? -4 : 2;
  const trend = p.lastGameResult?.outcome === "HR" || p.lastGameResult?.outcome === "Hit" ? 2 : 0;
  m = Math.max(0, Math.min(100, m + health + fatiguePenalty + trend));
  STATE.coreSystems.morale[key] = m;
  p.morale = Math.round(m);
}

function coreUpdateTeamChemistry() {
  if (!STATE?.player?.teamId) return;
  ensureCoreSystems(STATE);
  const team = STATE.teams?.[STATE.player.teamId];
  if (!team) return;
  const id = team.id;
  let c = Number(STATE.coreSystems.teamChemistry[id]);
  if (!Number.isFinite(c)) c = 60;
  const wins = Number(team.wins || 0), losses = Number(team.losses || 0);
  const record = wins + losses ? wins / (wins + losses) : 0.5;
  const target = 35 + record * 50;
  c += (target - c) * 0.05;
  STATE.coreSystems.teamChemistry[id] = Math.round(Math.max(0, Math.min(100, c)));
}

function coreGenerateWeather() {
  if (!STATE?.player) return null;
  ensureCoreSystems(STATE);
  const key = `${STATE.year}-${STATE.day}-${STATE.player.teamId || "none"}`;
  if (STATE.coreSystems.weather.key === key) return STATE.coreSystems.weather;
  const conditions = ["Clear", "Partly Cloudy", "Cloudy", "Windy", "Light Rain"];
  const temp = 55 + Math.floor(Math.random() * 35);
  const wind = Math.floor(Math.random() * 18);
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  STATE.coreSystems.weather = { key, condition, tempF: temp, windMph: wind };
  return STATE.coreSystems.weather;
}

function coreScoutingReport() {
  if (!STATE?.player?.teamId) return null;
  ensureCoreSystems(STATE);
  const team = STATE.teams?.[STATE.player.teamId];
  if (!team) return null;
  const opponents = (STATE.schedule || []).filter(g => !g.played && (g.home === team.id || g.away === team.id));
  const next = opponents[0];
  if (!next) return null;
  const opponentId = next.home === team.id ? next.away : next.home;
  const opp = STATE.teams?.[opponentId];
  if (!opp) return null;
  const hitters = opp.roster?.filter(p => !isPitcher(p.position)) || [];
  const pitchers = opp.roster?.filter(p => isPitcher(p.position)) || [];
  const avgPower = hitters.length ? Math.round(hitters.reduce((s,p) => s + Number(p.batting?.power || 50),0)/hitters.length) : 50;
  const avgControl = pitchers.length ? Math.round(pitchers.reduce((s,p) => s + Number(p.pitching?.control || 50),0)/pitchers.length) : 50;
  const report = {
    day: STATE.day, opponent: opp.name, opponentId,
    hitterPower: avgPower, pitcherControl: avgControl,
    threat: avgPower >= 70 ? "High" : avgPower >= 55 ? "Medium" : "Low",
    pitching: avgControl >= 70 ? "Strong" : avgControl >= 55 ? "Average" : "Inconsistent"
  };
  STATE.coreSystems.scouting.reports[`${STATE.year}-${STATE.day}`] = report;
  STATE.coreSystems.scouting.lastReportDay = STATE.day;
  return report;
}

function coreRecordGame(result) {
  if (!STATE || !result) return;
  ensureCoreSystems(STATE);
  STATE.coreSystems.gameHistory.unshift({
    year: STATE.year, day: STATE.day,
    home: result.homeTeam?.name, away: result.awayTeam?.name,
    homeScore: result.homeScore, awayScore: result.awayScore,
    winner: result.winner?.name
  });
  STATE.coreSystems.gameHistory = STATE.coreSystems.gameHistory.slice(0, 50);
  coreMarkDirty();
}

function coreFastSnapshot() {
  if (!STATE) return null;
  try {
    ensureCoreSystems(STATE);
    const copy = typeof compactStateForSave === "function"
      ? compactStateForSave(STATE)
      : JSON.parse(JSON.stringify(STATE));
    return JSON.stringify(copy);
  } catch (e) { return null; }
}

function coreAutoSaveSync(reason = "timer") {
  if (!STATE || STATE.phase === "creation") return false;
  const json = coreFastSnapshot();
  if (!json) return false;
  try {
    const old = localStorage.getItem(CORE_AUTOSAVE_KEY);
    if (old) localStorage.setItem(CORE_BACKUP_KEY, old);
    localStorage.setItem(CORE_AUTOSAVE_KEY, json);
    CORE_LAST_AUTOSAVE = Date.now();
    CORE_DIRTY = false;
    ensureCoreSystems(STATE);
    STATE.coreSystems.autosave.lastSavedAt = new Date().toISOString();
    STATE.coreSystems.autosave.saveCount = Number(STATE.coreSystems.autosave.saveCount || 0) + 1;
    STATE.coreSystems.autosave.lastReason = reason;
    return true;
  } catch (e) {
    ensureCoreSystems(STATE);
    STATE.coreSystems.autosave.lastError = e.message || "Storage error";
    return false;
  }
}

function coreRestoreAutosave() {
  try {
    const raw = localStorage.getItem(CORE_AUTOSAVE_KEY);
    if (!raw) return false;
    STATE = restoreLoadedState(JSON.parse(raw));
    ensureCoreSystems(STATE);
    ACTIVE_TAB = "career";
    CORE_DIRTY = false;
    renderAll();
    toast("Auto Save restored.");
    return true;
  } catch (e) { toast("Auto Save could not be restored."); return false; }
}

function coreInit() {
  if (CORE_AUTOSAVE_TIMER) clearInterval(CORE_AUTOSAVE_TIMER);
  CORE_AUTOSAVE_TIMER = setInterval(() => {
    if (CORE_DIRTY && STATE?.coreSystems?.autosave?.enabled !== false) coreAutoSaveSync("timer");
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && CORE_DIRTY) coreAutoSaveSync("background");
  });
  window.addEventListener("beforeunload", () => {
    if (CORE_DIRTY) coreAutoSaveSync("exit");
  });
}

function renderCoreSystemsView() {
  ensureCoreSystems(STATE);
  const c = STATE.coreSystems;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Core Systems"));
  card.appendChild(el("p", { class: "small-note" }, "Foundation systems that keep the career world persistent, readable, and reactive."));

  const status = c.autosave.lastSavedAt ? new Date(c.autosave.lastSavedAt).toLocaleString() : "Not yet saved";
  const grid = el("div", { class: "stat-grid" });
  const stats = [
    ["AUTO SAVE", c.autosave.enabled ? "ON" : "OFF"],
    ["LAST SAVE", status],
    ["MORALE", `${STATE.player?.morale ?? 60}/100`],
    ["CHEMISTRY", `${STATE.coreSystems.teamChemistry[STATE.player?.teamId] ?? 60}/100`],
    ["MILESTONES", String(c.milestones.unlocked.length)],
    ["NOTIFICATIONS", String(c.notifications.filter(n => !n.read).length)]
  ];
  for (const [a,b] of stats) grid.appendChild(el("div", {class:"stat-box"}, [el("div",{class:"stat-label"},a),el("div",{class:"stat-value"},b)]));
  card.appendChild(grid);

  const row = el("div", { class: "btn-row" });
  row.appendChild(el("button", { class: "btn amber", onclick: () => { coreAutoSaveSync("manual"); toast("Auto Save created."); renderAll(); } }, "SAVE NOW"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { coreScoutingReport(); renderAll(); } }, "SCOUT NEXT OPPONENT"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { c.autosave.enabled = !c.autosave.enabled; coreMarkDirty(); renderAll(); } }, c.autosave.enabled ? "DISABLE AUTO SAVE" : "ENABLE AUTO SAVE"));
  card.appendChild(row);

  const w = coreGenerateWeather();
  if (w) card.appendChild(el("p", {class:"small-note"}, `Weather: ${w.condition} · ${w.tempF}°F · Wind ${w.windMph} mph`));
  const recent = c.milestones.recent.slice(0,5);
  if (c.gameHistory.length) {
    card.appendChild(el("h3", {}, "Recent Games"));
    for (const g of c.gameHistory.slice(0,5)) card.appendChild(el("div", {class:"small-note"}, `• ${g.away} ${g.awayScore} — ${g.home} ${g.homeScore}`));
  }
  if (recent.length) {
    card.appendChild(el("h3", {}, "Recent Milestones"));
    for (const m of recent) card.appendChild(el("div", {class:"small-note"}, `• ${m.title} — ${m.message}`));
  }
  return card;
}
