// ============================================================
// SAVE / LOAD
// ============================================================
// Uses the browser's localStorage to save and load a single career slot
// ("career-save"). Also supports exporting the save to a downloadable
// .json file, and importing a .json file back in as a backup/transfer
// mechanism. Depends on js/game.js for STATE/ACTIVE_TAB/CREATION/
// renderAll/toast/el.

const SAVE_KEY = "baseball-career-save";

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
  card.appendChild(el("p", { class: "small-note" }, "Saves are stored in this browser (localStorage) and persist across sessions on this device. Use Export to back up your save as a file, or Import to load a save file from another device."));

  const row = el("div", { class: "btn-row" });
  row.appendChild(el("button", { class: "btn amber", onclick: doSave }, "Save Career"));
  row.appendChild(el("button", { class: "btn secondary", onclick: doLoad }, "Load Career"));
  row.appendChild(el("button", { class: "btn secondary", onclick: () => { if (confirm("Start a brand new career? This won't affect saved games unless you save over them.")) { STATE = newGameState(); CREATION = { name: "", age: 17, nationality: "USA", position: "SS", battingHand: "Right", throwingHand: "Right", height: 72, weight: 190 }; ACTIVE_TAB = "career"; renderAll(); } } }, "New Career"));
  card.appendChild(row);

  const row2 = el("div", { class: "btn-row" });
  row2.appendChild(el("button", { class: "btn secondary", onclick: doExport }, "Export Save (.json)"));

  const importInput = el("input", {
    type: "file",
    accept: "application/json,.json",
    style: "display:none",
    onchange: doImport
  });
  row2.appendChild(el("button", { class: "btn secondary", onclick: () => importInput.click() }, "Import Save (.json)"));
  row2.appendChild(importInput);
  card.appendChild(row2);

  return card;
}

// ---- localStorage save/load ----
function doSave() {
  try {
    const json = serializeState(STATE);
    localStorage.setItem(SAVE_KEY, json);
    toast("Career saved.");
  } catch (e) {
    toast("Save failed: " + e.message);
  }
}

function doLoad() {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (json) {
      STATE = deserializeState(json);
      ACTIVE_TAB = "career";
      toast("Career loaded.");
      renderAll();
    } else {
      toast("No saved career found.");
    }
  } catch (e) {
    toast("Load failed: " + e.message);
  }
}

// ---- Export to .json file ----
function doExport() {
  try {
    const json = serializeState(STATE);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const nameSafe = (STATE && STATE.player && STATE.player.name ? STATE.player.name : "career")
      .toString()
      .replace(/[^a-z0-9_-]+/gi, "_");
    const date = new Date().toISOString().slice(0, 10);
    const a = el("a", { href: url, download: `baseball-save-${nameSafe}-${date}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Save exported.");
  } catch (e) {
    toast("Export failed: " + e.message);
  }
}

// ---- Import from .json file ----
function doImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = deserializeState(reader.result);
      STATE = parsed;
      ACTIVE_TAB = "career";
      toast("Save imported.");
      renderAll();
    } catch (e) {
      toast("Import failed: invalid save file.");
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => {
    toast("Import failed: could not read file.");
    event.target.value = "";
  };
  reader.readAsText(file);
}
