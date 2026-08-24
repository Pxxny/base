// ============================================================
// PLAYER MODEL
// ============================================================
// Attributes are 1-100. Overall is derived from position-weighted
// attributes. Depends on data/players.js (name pools, POSITIONS,
// PITCH_TYPES) and js/leagues.js (rnd/pick/clamp/uid helpers).

function blankBattingAttrs(level) {
  return {
    contact: rnd(20, 20 + level), power: rnd(20, 20 + level), gapPower: rnd(20, 20 + level),
    plateDiscipline: rnd(20, 20 + level), clutch: rnd(20, 20 + level), speed: rnd(20, 20 + level)
  };
}
function blankFieldingAttrs(level) {
  return {
    fielding: rnd(20, 20 + level), armStrength: rnd(20, 20 + level), armAccuracy: rnd(20, 20 + level),
    reaction: rnd(20, 20 + level), range: rnd(20, 20 + level)
  };
}
function blankPitchingAttrs(level) {
  return {
    velocity: rnd(20, 20 + level), control: rnd(20, 20 + level), stamina: rnd(20, 20 + level),
    movement: rnd(20, 20 + level), pitchQuality: rnd(20, 20 + level)
  };
}

function isPitcher(position) { return ["SP", "RP", "CP"].includes(position); }

function createPlayer({ name, age, nationality, position, isUser = false, levelHint = 30 } = {}) {
  const pos = position || (Math.random() < 0.45 ? pick(POSITIONS.pitchers) : pick(POSITIONS.batters));
  const nat = nationality || pick(NATIONALITIES);
  const potential = clamp(Math.round(rnd(35, 99) * (0.6 + Math.random() * 0.6)), 30, 99);
  const player = {
    id: uid(),
    name: name || nameForNationality(nat),
    age: age ?? rnd(16, 18),
    nationality: nat,
    height: rnd(68, 78), // inches
    weight: rnd(160, 230),
    battingHand: pick(["Left", "Right", "Switch"]),
    throwingHand: pick(["Left", "Right"]),
    position: pos,
    personality: pick(PERSONALITIES),
    potential,
    isUser,
    batting: blankBattingAttrs(levelHint),
    fielding: blankFieldingAttrs(levelHint),
    pitching: isPitcher(pos) ? blankPitchingAttrs(levelHint) : blankPitchingAttrs(10),
    pitchTypes: isPitcher(pos) ? pickPitchRepertoire(pos) : [],
    health: { status: "Healthy", injury: null, daysOut: 0 },
    contract: null,
    teamId: null,
    level: "Amateur", // Amateur, HS, College, Rookie, Single-A, High-A, Double-A, Triple-A, MLB, NPB, KBO
    yearsPro: 0,
    retired: false,
    careerStats: emptyCareerStats(),
    seasonStats: emptySeasonStats(),
    seasonHistory: [], // array of {year, level, team, stats}
    awards: [],
    draftInfo: null,
    fatigue: 0,
    trainingFocus: null,
    lastStartDay: null, // STATE.day this pitcher last started (rotation rest tracking)
    developmentTrend: rnd(-2, 3) // slight per-player variance in growth rate
  };
  return player;
}

function pickPitchRepertoire(pos) {
  const count = pos === "CP" ? rnd(2, 3) : rnd(3, 5);
  const shuffled = [...PITCH_TYPES].sort(() => Math.random() - 0.5);
  return ["Fastball", ...shuffled.filter(p => p !== "Fastball").slice(0, count - 1)];
}

function emptyCareerStats() {
  return {
    batting: { G: 0, PA: 0, AB: 0, H: 0, "1B": 0, "2B": 0, "3B": 0, HR: 0, RBI: 0, R: 0, BB: 0, SO: 0, SB: 0, CS: 0 },
    pitching: { G: 0, GS: 0, IP: 0, W: 0, L: 0, SV: 0, H: 0, ER: 0, BB: 0, SO: 0 }
  };
}
function emptySeasonStats() { return emptyCareerStats(); }

// ============================================================
// OVERALL RATING CALCULATION
// ============================================================
function battingOverall(p) {
  const b = p.batting, f = p.fielding;
  return Math.round(
    b.contact * 0.22 + b.power * 0.18 + b.gapPower * 0.1 + b.plateDiscipline * 0.15 +
    b.clutch * 0.05 + b.speed * 0.1 + f.fielding * 0.1 + f.range * 0.1
  );
}
function pitchingOverall(p) {
  const pt = p.pitching;
  return Math.round(pt.velocity * 0.25 + pt.control * 0.25 + pt.stamina * 0.15 + pt.movement * 0.2 + pt.pitchQuality * 0.15);
}
function overallRating(p) {
  return isPitcher(p.position) ? pitchingOverall(p) : battingOverall(p);
}
