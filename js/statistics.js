// ============================================================
// DERIVED STATS (AVG/OBP/SLG/OPS/ERA/WHIP)
// ============================================================
function battingRates(s) {
  const AVG = s.AB > 0 ? s.H / s.AB : 0;
  const OBP = (s.AB + s.BB) > 0 ? (s.H + s.BB) / (s.AB + s.BB) : 0;
  const TB = s["1B"] + 2 * s["2B"] + 3 * s["3B"] + 4 * s.HR;
  const SLG = s.AB > 0 ? TB / s.AB : 0;
  return { AVG, OBP, SLG, OPS: OBP + SLG };
}
function pitchingRates(s) {
  const ERA = s.IP > 0 ? (s.ER * 9) / s.IP : 0;
  const WHIP = s.IP > 0 ? (s.BB + s.H) / s.IP : 0;
  return { ERA, WHIP };
}
function fmt3(x) { return (Number(x) || 0).toFixed(3).replace(/^0\./, "."); }

// safe numeric formatter - never throws, even if a field is missing,
// undefined, or a string left over from an older/foreign save file.
// This is what fixes the "Uncaught Error: Script error." that used to
// appear when opening the Stats tab: any stat object with a missing or
// non-numeric field (e.g. an old save without a newer field, or a value
// that arrived as a string after JSON round-tripping) would previously
// crash on a raw `.toFixed()` call.
function numFmt(v, decimals = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(decimals) : (decimals === 0 ? "0" : (0).toFixed(decimals));
}

// ============================================================
// STAT TABLES (UI)
// ============================================================
function renderStatsView() {
  const p = STATE.player;
  const wrap = el("div");
  if (!p) {
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", {}, "Stats"),
      el("p", { class: "small-note" }, "No active player yet — start or load a career to see stats here.")
    ]));
    return wrap;
  }
  const seasonCard = el("div", { class: "card" });
  seasonCard.appendChild(el("h2", {}, `${STATE.year} Season Stats`));
  if (!isPitcher(p.position)) seasonCard.appendChild(battingStatTable([{ label: STATE.year, s: p.seasonStats.batting }]));
  else seasonCard.appendChild(pitchingStatTable([{ label: STATE.year, s: p.seasonStats.pitching }]));
  wrap.appendChild(seasonCard);

  const careerCard = el("div", { class: "card" });
  careerCard.appendChild(el("h2", {}, "Career Totals"));
  if (!isPitcher(p.position)) careerCard.appendChild(battingStatTable([{ label: "Career", s: p.careerStats.batting }]));
  else careerCard.appendChild(pitchingStatTable([{ label: "Career", s: p.careerStats.pitching }]));
  wrap.appendChild(careerCard);

  if (p.seasonHistory && p.seasonHistory.length) {
    const histCard = el("div", { class: "card" });
    histCard.appendChild(el("h2", {}, "Season-by-Season"));
    const rows = p.seasonHistory.map((h, i) => ({ label: `${h.level} (Yr ${i + 1})`, s: isPitcher(p.position) ? h.pitching : h.batting }));
    histCard.appendChild(isPitcher(p.position) ? pitchingStatTable(rows) : battingStatTable(rows));
    wrap.appendChild(histCard);
  }
  return wrap;
}
function battingStatTable(rows) {
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["", "G", "PA", "AB", "H", "HR", "RBI", "BB", "SO", "AVG", "OBP", "SLG", "OPS"].map(h => el("th", {}, h))));
  for (const { label, s } of rows) {
    const stats = s || {};
    const r = battingRates({ AB: Number(stats.AB) || 0, BB: Number(stats.BB) || 0, H: Number(stats.H) || 0, "1B": Number(stats["1B"]) || 0, "2B": Number(stats["2B"]) || 0, "3B": Number(stats["3B"]) || 0, HR: Number(stats.HR) || 0 });
    table.appendChild(el("tr", {}, [
      el("td", {}, String(label)), el("td", {}, numFmt(stats.G)), el("td", {}, numFmt(stats.PA)), el("td", {}, numFmt(stats.AB)),
      el("td", {}, numFmt(stats.H)), el("td", {}, numFmt(stats.HR)), el("td", {}, numFmt(stats.RBI)), el("td", {}, numFmt(stats.BB)), el("td", {}, numFmt(stats.SO)),
      el("td", {}, fmt3(r.AVG)), el("td", {}, fmt3(r.OBP)), el("td", {}, fmt3(r.SLG)), el("td", {}, fmt3(r.OPS))
    ]));
  }
  return table;
}
function pitchingStatTable(rows) {
  const table = el("table", { class: "stat-table" });
  table.appendChild(el("tr", {}, ["", "G", "IP", "W", "L", "SV", "H", "BB", "SO", "ERA", "WHIP"].map(h => el("th", {}, h))));
  for (const { label, s } of rows) {
    const stats = s || {};
    const r = pitchingRates({ IP: Number(stats.IP) || 0, ER: Number(stats.ER) || 0, BB: Number(stats.BB) || 0, H: Number(stats.H) || 0 });
    table.appendChild(el("tr", {}, [
      el("td", {}, String(label)), el("td", {}, numFmt(stats.G)), el("td", {}, numFmt(stats.IP, 1)), el("td", {}, numFmt(stats.W)), el("td", {}, numFmt(stats.L)),
      el("td", {}, numFmt(stats.SV)), el("td", {}, numFmt(stats.H)), el("td", {}, numFmt(stats.BB)), el("td", {}, numFmt(stats.SO)),
      el("td", {}, numFmt(r.ERA, 2)), el("td", {}, numFmt(r.WHIP, 2))
    ]));
  }
  return table;
}
