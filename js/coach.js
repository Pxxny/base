// ============================================================
// COACH PERSONALITIES & LINEUP SELECTION
// ============================================================
// Every team has a manager with a personality that biases how they build
// their lineup each game — some ride their best pure hitters no matter
// what, some like to give young talent a look, some reward players who
// have been swinging a hot bat lately, some stick with the same veterans
// day after day. This replaces a naive "top-9-by-OVR" selection (which
// could bench the user's own player forever if their OVR trailed
// teammates) with a per-team scored selection that always has a real
// chance of including anyone healthy on the roster, including the user.
//
// Depends on js/player.js (battingOverall/pitchingOverall/isPitcher) and
// js/leagues.js (rnd/pick/clamp).

const COACH_PERSONALITIES = {
  "Win Now": {
    desc: "Plays the best roster on paper, every day. Stars sit rarely.",
    score(p, ctx) { return battingOverall(p) * 1.4 + (p.isUser ? ctx.userFormBonus * 0.3 : 0); }
  },
  "Development-Focused": {
    desc: "Wants to see what young players can do, even at the cost of a few losses.",
    score(p, ctx) {
      const youthBonus = clamp((26 - p.age) * 3, -10, 24);
      const potentialBonus = (p.potential - 50) * 0.3;
      return battingOverall(p) * 1.0 + youthBonus + potentialBonus + (p.isUser ? ctx.userFormBonus * 0.5 : 0);
    }
  },
  "Hot Hand": {
    desc: "Rides whoever has looked good in recent games, star or scrub.",
    score(p, ctx) { return battingOverall(p) * 0.9 + recentForm(p) * 1.6 + (p.isUser ? ctx.userFormBonus * 0.8 : 0); }
  },
  "Veteran-Favoring": {
    desc: "Trusts experience. Established veterans get the nod over unproven talent.",
    score(p, ctx) {
      const vetBonus = clamp((p.yearsPro || 0) * 2.5, 0, 20);
      const rookiePenalty = p.yearsPro <= 0 ? -8 : 0;
      return battingOverall(p) * 1.1 + vetBonus + rookiePenalty + (p.isUser ? ctx.userFormBonus * 0.2 : 0);
    }
  },
  "Balanced": {
    desc: "Weighs talent, form, and development fairly evenly.",
    score(p, ctx) {
      const youthBonus = clamp((27 - p.age) * 1.2, -6, 10);
      return battingOverall(p) * 1.15 + recentForm(p) * 0.8 + youthBonus + (p.isUser ? ctx.userFormBonus * 0.4 : 0);
    }
  }
};
const COACH_PERSONALITY_KEYS = Object.keys(COACH_PERSONALITIES);

// Assigns (or returns the existing) coach for a team. Stored on the team
// object so it persists for the season/career rather than re-rolling
// every game, which would make the "personality" meaningless.
function getTeamCoach(team) {
  if (!team.coach) {
    const key = pick(COACH_PERSONALITY_KEYS);
    team.coach = {
      name: nameForNationality("USA"),
      personality: key,
      // trust is a slow-moving 0-100 meter for the user player specifically:
      // good recent practice/game form nudges it up, a cold stretch nudges
      // it down. Starts at 50 (neutral).
      trustInUser: 50
    };
  }
  return team.coach;
}

// Cheap recency-of-form proxy: recent season rate stats vs a league-average
// baseline, scaled down so it nudges rather than dominates the OVR-based
// score. Falls back to 0 (neutral) for anyone with a very small sample.
function recentForm(p) {
  const s = p.seasonStats && p.seasonStats.batting;
  if (!s || s.AB < 8) return 0;
  const r = battingRates(s);
  return clamp((r.OPS - 0.72) * 40, -12, 16);
}

// The user's practice/training results feed a slow-moving "form" value
// on the player object (p.practiceForm, 0-100, defaults 50) that coaches
// factor in on top of raw OVR — this is what training.js nudges after a
// session, and what a hot/cold stretch of games nudges too.
function userFormBonus(p) {
  const form = typeof p.practiceForm === "number" ? p.practiceForm : 50;
  return (form - 50) * 0.4;
}

// Builds today's starting lineup (batting order 1-9 with field positions)
// for a team using its coach's scoring function. Always includes every
// healthy player who scores into the top slots at their natural
// position group first (pitchers excluded, DH included), falling back to
// filling remaining slots by best-available if a team is short-handed.
// Returns { coach, order: [{ player, battingOrder, position }] }
function buildLineup(team) {
  const coach = getTeamCoach(team);
  const personality = COACH_PERSONALITIES[coach.personality];
  const healthy = (team.roster || []).filter(p => !isPitcher(p.position) && p.health.status === "Healthy");
  const pool = healthy.length >= 9 ? healthy : (team.roster || []).filter(p => !isPitcher(p.position));
  const ctx = {};
  const scored = pool.map(p => ({
    player: p,
    score: personality.score(p, { userFormBonus: p.isUser ? userFormBonus(p) : 0 }) + rnd(-4, 4) // small noise so it's not perfectly deterministic
  }));
  scored.sort((a, b) => b.score - a.score);
  const starters = scored.slice(0, 9).map(s => s.player);

  // Assign field positions: prefer each player's own natural position,
  // fall back to filling gaps so the lineup is always a legal 9.
  const order = assignFieldPositions(starters);
  return { coach, order };
}

const DEFENSIVE_SLOTS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
function assignFieldPositions(starters) {
  const remaining = [...starters];
  const remainingSlots = [...DEFENSIVE_SLOTS];
  const order = [];
  // First pass: natural-position matches
  for (const slot of [...remainingSlots]) {
    const idx = remaining.findIndex(p => p.position === slot);
    if (idx >= 0) {
      order.push({ player: remaining.splice(idx, 1)[0], position: slot });
      remainingSlots.splice(remainingSlots.indexOf(slot), 1);
    }
  }
  // Second pass: fill any open slots with whoever's left
  for (const slot of remainingSlots) {
    if (!remaining.length) break;
    order.push({ player: remaining.shift(), position: slot });
  }
  // Batting order: sort by battingOverall desc for a sensible order 1-9,
  // but keep the position assignment made above.
  order.sort((a, b) => battingOverall(b.player) - battingOverall(a.player));
  order.forEach((o, i) => o.battingOrder = i + 1);
  return order;
}

// Picks today's starting pitcher using the same coach-personality lens
// (a Veteran-Favoring coach leans on established arms, a
// Development-Focused one gives young arms starts, etc). Every healthy
// starter in the rotation gets scored (not just uniformly sampled from a
// "top half" bucket) so a pitcher who is clearly the best on the staff
// gets the ball far more often than a marginal back-of-rotation arm,
// instead of being diluted into a coin-flip against everyone else in a
// same-sized pool.
function pickStartingPitcher(team) {
  const coach = getTeamCoach(team);
  const sps = (team.roster || []).filter(p => p.position === "SP" && p.health.status === "Healthy");
  if (!sps.length) {
    const anyP = (team.roster || []).filter(p => isPitcher(p.position)).sort((a, b) => pitchingOverall(b) - pitchingOverall(a));
    return anyP.length ? anyP[0] : createPlayer({ position: "SP" });
  }
  if (sps.length === 1) return sps[0];

  const scored = sps.map(p => {
    let score = pitchingOverall(p) * 1.5; // dominant factor: raw talent
    if (coach.personality === "Development-Focused") score += clamp((28 - p.age) * 2.5, -10, 20);
    else if (coach.personality === "Veteran-Favoring") score += clamp((p.yearsPro || 0) * 2, 0, 16);
    else if (coach.personality === "Hot Hand") score += recentForm(p) * 1.2;
    if (p.isUser) score += userFormBonus(p) * 0.4;
    return { player: p, score };
  });

  // Weighted pick where the weight scales with how far ABOVE the weakest
  // arm in the pool a pitcher's score is, not just their rank - so a
  // true ace with a huge score gap over the back of the rotation starts
  // most games, while a tightly-bunched rotation still rotates fairly
  // evenly between similar arms. A little noise keeps it from being a
  // hard guarantee every single time.
  const minScore = Math.min(...scored.map(s => s.score));
  const weights = scored.map(s => Math.pow(1.09, (s.score - minScore) + rnd(-2, 2)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return scored[i].player;
  }
  return scored.sort((a, b) => b.score - a.score)[0].player;
}

// Bullpen arms available for in-game relief substitutions, best-first.
function bullpenOptions(team, excludeId) {
  return (team.roster || [])
    .filter(p => isPitcher(p.position) && p.position !== "SP" && p.health.status === "Healthy" && p.id !== excludeId)
    .sort((a, b) => pitchingOverall(b) - pitchingOverall(a));
}

// Bench batters available for in-game pinch-hit/defensive substitutions.
function benchOptions(team, currentOrder) {
  const startingIds = new Set(currentOrder.map(o => o.player.id));
  return (team.roster || [])
    .filter(p => !isPitcher(p.position) && p.health.status === "Healthy" && !startingIds.has(p.id))
    .sort((a, b) => battingOverall(b) - battingOverall(a));
}
