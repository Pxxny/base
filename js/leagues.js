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

// MINOR_LEVELS, MINOR_LEAGUES_BY_LEVEL, MINOR_LEVEL_CODE, and
// MINOR_LEVEL_GAMES live in data/minor-leagues.js (loaded before this file).

const ALL_PRO_TEAMS = [...MLB_TEAMS, ...NPB_TEAMS, ...KBO_TEAMS];

// ============================================================
// MINOR LEAGUE AFFILIATE TEAMS
// ============================================================
// Builds one affiliate team per MLB org per level (e.g. "NYY-AAA"),
// assigned round-robin into that level's named leagues so each league
// ends up with a roughly even number of teams. Called once at game
// start from initLeagueTeams(); the resulting team objects live
// alongside MLB/NPB/KBO teams in state.teams / state.allTeams, keyed by
// a "leagueGroup" (e.g. "Triple-A:International League") instead of a
// plain league code, so the schedule/standings/sim code can group them.
const MINOR_TEAM_NAME_SUFFIX = {
  "Triple-A": "Triple-A", "Double-A": "Double-A", "High-A": "High-A",
  "Single-A": "Single-A", "Rookie": "Rookie"
};

function buildMinorAffiliateTeams() {
  const teams = [];
  for (const level of MINOR_LEVELS) {
    const leagueNames = MINOR_LEAGUES_BY_LEVEL[level];
    MLB_TEAMS.forEach((org, i) => {
      const leagueName = leagueNames[i % leagueNames.length];
      const code = MINOR_LEVEL_CODE[level];
      teams.push({
        id: `${org.id}-${code}`,
        name: `${org.city} ${MINOR_TEAM_NAME_SUFFIX[level]}`,
        city: org.city,
        stadium: org.stadium + " (Minors)",
        league: "MINORS",
        minorLevel: level,
        minorLeagueName: leagueName,
        leagueGroup: `${level}:${leagueName}`,
        parentOrgId: org.id,
        division: leagueName
      });
    });
  }
  return teams;
}

const ALL_MINOR_TEAMS = buildMinorAffiliateTeams();

// All minor-league "leagueGroup" keys, e.g. "Triple-A:International League".
function allMinorLeagueGroups() {
  const groups = [];
  for (const level of MINOR_LEVELS) {
    for (const name of MINOR_LEAGUES_BY_LEVEL[level]) groups.push(`${level}:${name}`);
  }
  return groups;
}

// Finds the affiliate team for a given MLB org id + minor level.
function affiliateTeamId(orgId, level) {
  return `${orgId}-${MINOR_LEVEL_CODE[level]}`;
}

function TEAM_NAME(id) {
  const t = ALL_PRO_TEAMS.find(t => t.id === id) || ALL_MINOR_TEAMS.find(t => t.id === id);
  return (t || {}).name || id;
}

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
