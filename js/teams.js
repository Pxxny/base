// ============================================================
// TEAM MODEL
// ============================================================
// Wraps the plain team records from data/mlb-teams.js, npb-teams.js,
// and kbo-teams.js with in-game state (ratings, budget, roster,
// standings). Depends on js/player.js (createPlayer) and
// js/leagues.js (rnd/pick/clamp).

function initTeam(teamData) {
  const offense = rnd(55, 90);
  const defense = rnd(55, 90);
  const pitchingR = rnd(55, 90);
  return {
    ...teamData,
    teamRating: Math.round((offense + defense + pitchingR) / 3),
    offenseRating: offense,
    defenseRating: defense,
    pitchingRating: pitchingR,
    financialStatus: pick(["Small Market", "Mid Market", "Large Market", "Big Spender"]),
    budget: rnd(80, 260), // millions
    roster: [],
    farmSystem: [],
    wins: 0, losses: 0,
    standingsHistory: []
  };
}

function generateRosterForTeam(team, leagueLevel = 45) {
  const roster = [];
  const needed = { C: 2, "1B": 2, "2B": 2, "3B": 2, SS: 2, LF: 1, CF: 2, RF: 1, DH: 1, SP: 6, RP: 6, CP: 1 };
  for (const [pos, count] of Object.entries(needed)) {
    for (let i = 0; i < count; i++) {
      const age = rnd(21, 36);
      const p = createPlayer({ age, position: pos, levelHint: leagueLevel + rnd(-10, 15) });
      p.teamId = team.id;
      p.level = team.league;
      p.yearsPro = clamp(age - 21, 0, 15);
      roster.push(p);
    }
  }
  team.roster = roster;
  return roster;
}
