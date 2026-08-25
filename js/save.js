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
// Saves can become large because teams/rosters contain many player objects.
// allTeams is only a convenience array (the canonical copy is teams), and
// the current schedule is regenerated/unused by the season loop. Strip those
// duplicated/transient fields, then gzip when the browser supports it.
function compactStateForSave(state) {
  const copy = JSON.parse(JSON.stringify(state, (key, value) => {
    if (key === "allTeams" || key === "schedule" || key === "scheduleIndex") return undefined;
    return value;
  }));
  copy.saveVersion = 3;
  copy.savedAt = new Date().toISOString();
  return copy;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzipString(text) {
  if (!window.CompressionStream) return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}
async function gunzipBase64(base64) {
  if (!window.DecompressionStream) return null;
  const bytes = base64ToBytes(base64);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

function restoreLoadedState(parsed) {
  // Rebuild the convenience array that old code expects without duplicating
  // it in the saved payload.
  if (!parsed.allTeams && parsed.teams) parsed.allTeams = Object.values(parsed.teams);
  if (!parsed.schedule) parsed.schedule = [];
  if (parsed.scheduleIndex == null) parsed.scheduleIndex = 0;
  parsed.rivalries ||= {};
  parsed.transactionLog ||= [];
  parsed.tradeOffers ||= [];
  parsed.waiverClaims ||= [];
  parsed.freeAgentPool ||= [];
  parsed.h2h ||= {};
  return parsed;
}

async function doSave() {
  try {
    const json = JSON.stringify(compactStateForSave(STATE));
    const compressed = await gzipString(json);
    const payload = compressed ? "GZ1:" + compressed : "JS1:" + json;
    try {
      localStorage.setItem(SAVE_KEY, payload);
    } catch (e) {
      // Last-resort recovery: remove only our own older save, then retry once.
      if (e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""))) {
        localStorage.removeItem(SAVE_KEY);
        localStorage.setItem(SAVE_KEY, payload);
      } else throw e;
    }
    const kb = Math.round(payload.length / 1024);
    toast(`Career saved (${kb} KB).`);
  } catch (e) {
    console.error("Save failed", e);
    toast("Save failed: " + (e.message || e));
  }
}

async function doLoad() {
  try {
    const payload = localStorage.getItem(SAVE_KEY);
    if (!payload) {
      toast("No saved career found.");
      return;
    }
    let json;
    if (payload.startsWith("GZ1:")) json = await gunzipBase64(payload.slice(4));
    else if (payload.startsWith("JS1:")) json = payload.slice(4);
    else json = payload; // backward compatibility with the old plain JSON save
    STATE = restoreLoadedState(deserializeState(json));
    ACTIVE_TAB = "career";
    toast("Career loaded.");
    renderAll();
  } catch (e) {
    console.error("Load failed", e);
    toast("Load failed: " + (e.message || e));
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
