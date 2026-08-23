// ============================================================
// INJURIES
// ============================================================
// Depends on js/leagues.js (rnd/pick).

const INJURY_TYPES = [
  { name: "Muscle Strain", minDays: 10, maxDays: 21, severity: "Minor" },
  { name: "Hamstring Strain", minDays: 14, maxDays: 30, severity: "Minor" },
  { name: "Shoulder Inflammation", minDays: 15, maxDays: 45, severity: "Moderate" },
  { name: "Elbow Soreness", minDays: 15, maxDays: 60, severity: "Moderate" },
  { name: "Back Spasms", minDays: 7, maxDays: 20, severity: "Minor" },
  { name: "Hand Contusion", minDays: 5, maxDays: 14, severity: "Minor" },
  { name: "Knee Sprain", minDays: 20, maxDays: 50, severity: "Moderate" },
  { name: "Oblique Strain", minDays: 21, maxDays: 40, severity: "Moderate" },
  { name: "UCL Sprain (Elbow)", minDays: 60, maxDays: 180, severity: "Severe" },
  { name: "Torn ACL", minDays: 180, maxDays: 300, severity: "Severe" }
];

function injurePlayer(p) {
  const inj = pick(INJURY_TYPES);
  const days = rnd(inj.minDays, inj.maxDays);
  p.health = { status: "Injured", injury: inj.name, daysOut: days, severity: inj.severity };
  return p.health;
}
function advanceInjuryDays(p, days = 1) {
  if (p.health.status === "Injured") {
    p.health.daysOut -= days;
    if (p.health.daysOut <= 0) p.health = { status: "Healthy", injury: null, daysOut: 0 };
  }
}
function maybeRandomInjury(p, chancePerGame = 0.004) {
  if (p.health.status === "Healthy" && Math.random() < chancePerGame) {
    injurePlayer(p);
    return true;
  }
  return false;
}

// Daily fatigue recovery. Training pushes fatigue up (see career.js
// trainPlayer) but nothing ever brought it back down, so it would sit at
// 100/100 forever once maxed out. A day of rest/normal activity recovers
// a modest amount; players who are hurt recover a bit faster since
// they're not exerting themselves in games either way.
function recoverFatigue(p, days = 1) {
  if (typeof p.fatigue !== "number") { p.fatigue = 0; return; }
  const perDay = p.health.status === "Injured" ? 10 : 6;
  p.fatigue = clamp(p.fatigue - perDay * days, 0, 100);
}
