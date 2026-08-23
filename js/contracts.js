// ============================================================
// CONTRACTS
// ============================================================
// Depends on js/player.js (overallRating) and js/leagues.js (rnd).

function estimateSalary(p, level) {
  const ov = overallRating(p);
  const levelMult = { Amateur: 0, HS: 0, College: 0, Rookie: 0.01, "Single-A": 0.012, "High-A": 0.015, "Double-A": 0.02, "Triple-A": 0.03, MLB: 1, NPB: 0.6, KBO: 0.4 }[level] ?? 0.05;
  const base = Math.max(0.4, (ov - 40) * 0.35);
  return Math.round(base * levelMult * 100) / 100; // millions
}

function generateContract(p, level, years = null) {
  const salary = estimateSalary(p, level);
  const length = years || rnd(1, 4);
  return {
    level, salary, years: length, yearSigned: null, type: level === "MLB" || level === "NPB" || level === "KBO" ? "Pro Contract" : "Minor League Contract",
    bonus: Math.round(salary * rnd(5, 20)) / 100
  };
}

// ---- Contract UI view ----
function renderContractView() {
  const p = STATE.player;
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "Contract"));
  if (!p) {
    card.appendChild(el("p", { class: "small-note" }, "No active player yet."));
    return card;
  }
  if (!p.contract) {
    card.appendChild(el("p", {}, "No active contract — you're an amateur or unsigned free agent."));
  } else {
    card.appendChild(el("div", { class: "stat-strip" }, [
      statBox("Level", p.contract.level),
      statBox("Salary", `$${p.contract.salary}M`),
      statBox("Years", p.contract.years),
      statBox("Type", p.contract.type)
    ]));
  }
  card.appendChild(el("h3", { style: "margin-top:18px;" }, "Estimated Market Value"));
  card.appendChild(el("p", {}, `Based on current performance (OVR ${overallRating(p)}), your estimated market value is roughly $${estimateSalary(p, p.level === "MLB" || p.level === "NPB" || p.level === "KBO" ? p.level : "Triple-A")}M/year.`));
  return card;
}
