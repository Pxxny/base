// ============================================================
// SAVE / LOAD
// ============================================================
// Uses window.storage (Claude artifact persistent storage) to save and
// load a single career slot ("career-save"). Depends on js/game.js for
// STATE/ACTIVE_TAB/CREATION/renderAll/toast/el.

function serializeState(state) {
  return JSON.stringify(state);
}
function deserializeState(json) {
  return JSON.parse(json);
}

// ---- Save/Load UI view ----
function renderSaveView() {
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Save / Load Career"));
  card.appendChild(el("p", { class: "small-note" }, "Saves are stored to your account and persist across sessions."));
  const row = el("div", { class: "btn-row" });
  row.appendChild(el("button", { class: "btn amber", onclick: doSave }, "Save Career"));
  row.appendChild(el("button", { class: "btn secondary", onclick: doLoad }, "Load Career"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { if (confirm("Start a brand new career? This won't affect saved games unless you save over them.")) { STATE = newGameState(); CREATION = { name: "", age: 17, nationality: "USA", position: "SS", battingHand: "Right", throwingHand: "Right", height: 72, weight: 190 }; ACTIVE_TAB = "career"; renderAll(); } } }, "New Career"));
  card.appendChild(row);
  return card;
}

async function doSave() {
  try {
    const json = serializeState(STATE);
    const res = await window.storage.set("career-save", json, false);
    if (res) toast("Career saved.");
    else toast("Save failed — please try again.");
  } catch (e) {
    toast("Save failed: " + e.message);
  }
}
async function doLoad() {
  try {
    const res = await window.storage.get("career-save", false);
    if (res && res.value) {
      STATE = deserializeState(res.value);
      ACTIVE_TAB = "career";
      toast("Career loaded.");
      renderAll();
    } else {
      toast("No saved career found.");
    }
  } catch (e) {
    toast("No saved career found.");
  }
}
