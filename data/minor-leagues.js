// ============================================================
// MINOR LEAGUE STRUCTURE (MLB farm system)
// ============================================================
// Real-world-style Minor League levels and league names. Each MLB org
// gets one affiliate team per level, placed into one of that level's
// leagues (round-robin by org index so leagues stay balanced in size).
// Depends on nothing (pure data) but is consumed by js/leagues.js.

const MINOR_LEVELS = ["Rookie", "Single-A", "High-A", "Double-A", "Triple-A"];

// Level -> ordered list of league names at that level.
const MINOR_LEAGUES_BY_LEVEL = {
  "Triple-A": ["International League", "Pacific Coast League"],
  "Double-A": ["Eastern League", "Southern League", "Texas League"],
  "High-A": ["Midwest League", "Northwest League", "South Atlantic League"],
  "Single-A": ["California League", "Carolina League", "Florida State League"],
  "Rookie": ["Arizona Complex League", "Florida Complex League", "Dominican Rookie League"]
};

// Short level codes used for id-building, e.g. "NYY-AAA".
const MINOR_LEVEL_CODE = {
  "Rookie": "R", "Single-A": "A", "High-A": "A+", "Double-A": "AA", "Triple-A": "AAA"
};

// regularSeasonGames per level - shorter seasons the lower you go, and
// Rookie ball is especially short (mirrors real complex-league length).
const MINOR_LEVEL_GAMES = {
  "Rookie": 60, "Single-A": 110, "High-A": 120, "Double-A": 132, "Triple-A": 150
};
