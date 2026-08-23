// ============================================================
// APP STATE & BOOTSTRAP
// ============================================================
// This is the entry point: generic DOM helpers (el/toast), the ticker,
// tab navigation, and the top-level screen router. Every other js/*.js
// file depends on el()/toast()/renderAll()/STATE/ACTIVE_TAB defined here,
// so this file must load LAST in index.html.

let STATE = null;
let ACTIVE_TAB = "career";
let LAST_GAME_LOGS = [];
let CREATION = { name: "", age: 17, nationality: "USA", position: "SS", battingHand: "Right", throwingHand: "Right", height: 72, weight: 190 };

const TABS = [
  { id: "career", label: "CAREER" },
  { id: "roster", label: "ROSTER" },
  { id: "coach", label: "COACH" },
  { id: "training", label: "TRAINING" },
  { id: "stats", label: "STATS" },
  { id: "standings", label: "STANDINGS" },
  { id: "contracts", label: "CONTRACT" },
  { id: "awards", label: "AWARDS" },
  { id: "news", label: "NEWS" },
  { id: "save", label: "SAVE/LOAD" }
];

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function toast(msg) {
  const wrap = document.getElementById("toast-wrap");
  const t = el("div", { class: "toast" }, msg);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function renderTicker() {
  const track = document.getElementById("tickerTrack");
  const items = (STATE?.news || []).slice(0, 12);
  const content = items.length ? items : [{ headline: "Welcome to Diamond Legacy — build your career from the ground up." }];
  const html = content.map(n => `<span class="ticker-item">${escapeHtml(n.headline)}</span>`).join("");
  track.innerHTML = html + html; // duplicate for seamless scroll
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderTabs() {
  const nav = document.getElementById("tabs");
  nav.innerHTML = "";
  if (!STATE || !STATE.player || STATE.phase === "creation" || STATE.phase.includes("select") || STATE.phase.includes("prep") || STATE.phase === "draft-results" || STATE.phase.includes("season") && STATE.phase !== "season") {
    return; // hide tabs during setup flows
  }
  const tabsToShow = GAME_VIEW ? [{ id: "gameday", label: "GAME DAY" }, ...TABS] : TABS;
  for (const t of tabsToShow) {
    const btn = el("button", {
      class: t.id === ACTIVE_TAB ? "active" : "",
      onclick: () => { ACTIVE_TAB = t.id; renderMain(); renderTabs(); }
    }, t.label);
    nav.appendChild(btn);
  }
}

function renderTopRight() {
  const box = document.getElementById("topRightInfo");
  if (!STATE) { box.textContent = ""; return; }
  box.textContent = `YEAR ${STATE.year} · DAY ${STATE.day}`;
}

function renderAll() {
  try {
    renderTicker();
    renderTabs();
    renderTopRight();
    renderMain();
  } catch (e) {
    reportRenderError(e);
  }
}

// If any screen throws (a bad save file, an unexpected null field, etc.)
// show a readable in-app message instead of letting it surface as an
// opaque, unhelpful browser error with no way to recover from the UI.
function reportRenderError(e) {
  console.error("Diamond Legacy render error:", e);
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = "";
  main.appendChild(el("div", { class: "card" }, [
    el("h2", {}, "Something went wrong"),
    el("p", {}, "This screen hit an unexpected error and couldn't render. Your save data is untouched."),
    el("p", { class: "small-note" }, String(e && e.message ? e.message : e)),
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn amber", onclick: () => { ACTIVE_TAB = "career"; renderAll(); } }, "Back to Career"),
      el("button", { class: "btn secondary", onclick: () => { ACTIVE_TAB = "save"; renderAll(); } }, "Go to Save/Load")
    ])
  ]));
}

window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error || e.message);
});

// ============================================================
// MAIN ROUTER
// ============================================================
function renderMain() {
  const main = document.getElementById("main");
  main.innerHTML = "";
  if (!STATE) STATE = newGameState();

  if (STATE.phase === "creation") return main.appendChild(screenCreation());
  if (STATE.phase === "mode-select") return main.appendChild(screenModeSelect());
  if (STATE.phase === "hs-season" || STATE.phase === "college-season") return main.appendChild(screenAmateurSeason());
  if (STATE.phase === "draft-prep") return main.appendChild(screenDraftPrep());
  if (STATE.phase === "draft-results") return main.appendChild(screenDraftResults());
  if (STATE.phase === "team-select") return main.appendChild(screenTeamSelect());
  if (STATE.phase === "season" || STATE.phase === "offseason") return main.appendChild(screenTab(ACTIVE_TAB));

  main.appendChild(el("div", { class: "empty-state" }, "Loading..."));
}

// ============================================================
// INIT
// ============================================================
renderAll();
