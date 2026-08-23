// ============================================================
// LEAGUE CONFIGURATION
// ============================================================
// Combines team data from /data/*-teams.js into the ALL_PRO_TEAMS
// list and defines top-level league metadata plus small shared
// utility helpers used throughout the app.

const LEAGUES = {
  MLB: { name: "Major League Baseball", teams: 30, regularSeasonGames: 162, level: 5, country: "USA" },
  NPB: { name: "Nippon Professional Baseball", teams: 12, regularSeasonGames: 143, level: 5, country: "Japan" },
  KBO: { name: "Korea Baseball Organization", teams: 10, regularSeasonGames: 144, level: 5, country: "South Korea" },
  MINORS: { name: "Minor League Baseball", teams: 0, regularSeasonGames: 138, level: 0, country: "USA" }
};

const MINOR_LEVELS = ["Rookie", "Single-A", "High-A", "Double-A", "Triple-A"];

const ALL_PRO_TEAMS = [...MLB_TEAMS, ...NPB_TEAMS, ...KBO_TEAMS];

function TEAM_NAME(id) { return (ALL_PRO_TEAMS.find(t => t.id === id) || {}).name || id; }

// ============================================================
// UTILITY
// ============================================================
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function uid() { return Math.random().toString(36).slice(2, 10); }

function nameForNationality(nat) {
  if (nat === "Japan") return `${pick(FIRST_NAMES_JP)} ${pick(LAST_NAMES_JP)}`;
  if (nat === "South Korea") return `${pick(FIRST_NAMES_KR)} ${pick(LAST_NAMES_KR)}`;
  return `${pick(FIRST_NAMES_US)} ${pick(LAST_NAMES_US)}`;
}
