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

// How much a coach's trust in the user nudges their selection odds.
// trustInUser is a slow-moving 0-100 meter (see getTeamCoach); above the
// neutral midpoint it's a bonus, below it a penalty, so earning trust
// (via talking to the coach, or being asked for and beating out) really
// does translate into more starts.
function userTrustBonus(team) {
  const coach = getTeamCoach(team);
  return (coach.trustInUser - 50) * 0.3;
}

// Builds today's starting lineup (batting order 1-9 with field positions)
// for a team using its coach's scoring function. Always includes every
// healthy player who scores into the top slots at their natural
// position group first (pitchers excluded, DH included), falling back to
// filling remaining slots by best-available if a team is short-handed.
// Returns { coach, order: [{ player, battingOrder, position }] }
function buildLineup(team) {
  const managerChoice = (typeof managerLineupForTeam === "function") ? managerLineupForTeam(team) : null;
  if (managerChoice) return managerChoice;
  const coach = getTeamCoach(team);
  const personality = COACH_PERSONALITIES[coach.personality];
  const healthy = (team.roster || []).filter(p => !isPitcher(p.position) && p.health.status === "Healthy");
  const pool = healthy.length >= 9 ? healthy : (team.roster || []).filter(p => !isPitcher(p.position));
  const ctx = {};
  const scored = pool.map(p => ({
    player: p,
    score: personality.score(p, { userFormBonus: p.isUser ? userFormBonus(p) : 0 })
      + (p.isUser ? userTrustBonus(team) : 0)
      + rnd(-4, 4) // small noise so it's not perfectly deterministic
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
//
// Rest: real starting rotations work on ~4-5 days' rest between starts
// (a 5-man rotation), not "whoever scores highest every single day."
// p.lastStartDay records the STATE.day a pitcher last started, and a
// pitcher who started fewer than REST_DAYS_MIN days ago is excluded from
// today's pool outright, same as a real manager skipping a starter's turn.
// If every starter on the roster is currently short-rested (a thin staff,
// early in a career, etc), rest is relaxed just enough to field a pitcher
// rather than leaving a team with nobody eligible to start.
const REST_DAYS_MIN = 4; // must have started at least this many days ago
function pickStartingPitcher(team) {
  const coach = getTeamCoach(team);
  const today = (typeof STATE !== "undefined" && STATE) ? STATE.day : null;
  const allSps = (team.roster || []).filter(p => p.position === "SP" && p.health.status === "Healthy");
  const daysSinceStart = (p) => (today == null || typeof p.lastStartDay !== "number") ? Infinity : today - p.lastStartDay;
  let sps = allSps.filter(p => daysSinceStart(p) >= REST_DAYS_MIN);
  // Nobody's rested (short staff, or every arm just pitched) - fall back to
  // whoever has the most rest so the game still has a starter, rather than
  // refusing to field one.
  if (!sps.length) sps = [...allSps].sort((a, b) => daysSinceStart(b) - daysSinceStart(a));
  if (!sps.length) {
    const anyP = (team.roster || []).filter(p => isPitcher(p.position)).sort((a, b) => pitchingOverall(b) - pitchingOverall(a));
    const emergency = anyP.length ? anyP[0] : createPlayer({ position: "SP" });
    if (today != null) emergency.lastStartDay = today;
    return emergency;
  }
  if (sps.length === 1) {
    if (today != null) sps[0].lastStartDay = today;
    return sps[0];
  }

  const scored = sps.map(p => {
    let score = pitchingOverall(p) * 1.5; // dominant factor: raw talent
    if (coach.personality === "Development-Focused") score += clamp((28 - p.age) * 2.5, -10, 20);
    else if (coach.personality === "Veteran-Favoring") score += clamp((p.yearsPro || 0) * 2, 0, 16);
    else if (coach.personality === "Hot Hand") score += recentForm(p) * 1.2;
    if (p.isUser) score += userFormBonus(p) * 0.4 + userTrustBonus(team);
    return { player: p, score };
  });

  // Weighted pick where the weight scales with how far ABOVE the weakest
  // arm in the pool a pitcher's score is, not just their rank - so a
  // true ace with a real score gap over the back of the rotation starts
  // most games, while a tightly-bunched rotation still rotates fairly
  // evenly between similar arms. The base (1.16 vs the old 1.09) makes
  // that gap count for much more, so a pitcher who is clearly the best
  // on the staff — which coach trust also helps with, for the user —
  // gets the ball the large majority of the time instead of being
  // diluted into a near coin-flip against a 5-6 man rotation. A little
  // noise keeps it from being a hard guarantee every single time.
  const minScore = Math.min(...scored.map(s => s.score));
  const weights = scored.map(s => Math.pow(1.16, (s.score - minScore) + rnd(-2, 2)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  let chosen = null;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { chosen = scored[i].player; break; }
  }
  if (!chosen) chosen = scored.sort((a, b) => b.score - a.score)[0].player;
  if (today != null) chosen.lastStartDay = today;
  return chosen;
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

// ============================================================
// COACH MENU: conversation topics + limited requests
// ============================================================
// Lets the user check in with their coach: chat about a handful of
// topics to nudge trust up or down in real time based on how the
// exchange goes, or make a formal ask (new contract / send me down to
// get reps / push me up a level). Each request type is capped to once
// per real in-game week (STATE.day) so the user can't just spam-click
// their way to a promotion.

const COACH_REQUEST_COOLDOWN_DAYS = 7;

// Conversation topics. Each has a short line of coach dialogue and a
// trust delta that depends a little on how the coach's personality
// reacts to the subject (a Development-Focused coach responds better to
// "how can I improve" than a Win Now coach does, etc), so the same
// topic doesn't feel identical across every team.
const COACH_TALK_TOPICS = {
  "Ask about your role": {
    prompt: "Where do I stand with you right now?",
    reply(coach, p) {
      if (coach.trustInUser >= 65) return { line: "You've earned a real look — keep it up and the lineup's yours.", delta: 2 };
      if (coach.trustInUser >= 40) return { line: "You're in the mix. Prove it and the playing time follows.", delta: 1 };
      return { line: "Honestly? You need to show me more before I lean on you.", delta: 0 };
    }
  },
  "Ask how to improve": {
    prompt: "What do I need to work on to earn more time?",
    reply(coach, p) {
      const bonus = coach.personality === "Development-Focused" ? 3 : 1;
      return { line: "Keep grinding in training and it won't go unnoticed.", delta: bonus };
    }
  },
  "Talk about recent performance": {
    prompt: "What did you think of how I've been playing?",
    reply(coach, p) {
      const form = recentForm(p);
      if (form > 6) return { line: "You've been swinging it well lately — I've noticed.", delta: 3 };
      if (form < -6) return { line: "It's been a rough stretch. Shake it off and keep working.", delta: -2 };
      return { line: "Steady. Nothing flashy, nothing to worry about either.", delta: 1 };
    }
  },
  "Express frustration about playing time": {
    prompt: "I need more chances to prove myself out there.",
    reply(coach, p) {
      if (coach.personality === "Win Now") return { line: "I hear you, but I play what wins games. Earn it.", delta: -1 };
      return { line: "Understood. I'll keep it in mind.", delta: 1 };
    }
  }
};

function talkToCoach(team, topicKey, p) {
  const coach = getTeamCoach(team);
  const topic = COACH_TALK_TOPICS[topicKey];
  if (!topic) return null;
  const result = topic.reply(coach, p);
  coach.trustInUser = clamp(coach.trustInUser + result.delta, 0, 100);
  return { prompt: topic.prompt, line: result.line, delta: result.delta, trustInUser: coach.trustInUser };
}

// Request types a player can make of their coach, each gated to once
// per COACH_REQUEST_COOLDOWN_DAYS in-game days (tracked on the coach
// object under lastRequestDay.<type>).
function canMakeCoachRequest(team, type, currentDay) {
  const coach = getTeamCoach(team);
  const last = (coach.lastRequestDay || {})[type];
  if (last == null) return { allowed: true };
  const daysSince = currentDay - last;
  if (daysSince >= COACH_REQUEST_COOLDOWN_DAYS) return { allowed: true };
  return { allowed: false, daysLeft: COACH_REQUEST_COOLDOWN_DAYS - daysSince };
}

function recordCoachRequest(team, type, currentDay) {
  const coach = getTeamCoach(team);
  if (!coach.lastRequestDay) coach.lastRequestDay = {};
  coach.lastRequestDay[type] = currentDay;
}

// "New contract": chance of success scales with trust + current
// performance; success re-signs at market rate, failure just costs a
// little trust for asking too soon.
function requestNewContract(state, team, p) {
  const coach = getTeamCoach(team);
  const ov = overallRating(p);
  const chance = clamp((coach.trustInUser - 30) * 0.012 + (ov - 50) * 0.01, 0.05, 0.85);
  const success = Math.random() < chance;
  if (success) {
    p.contract = generateContract(p, p.level, rnd(1, 3));
    addNews(state, `${p.name} agrees to a new contract: $${p.contract.salary}M/yr.`);
    return { success: true, line: `Alright, you've earned it. Let's get you a new deal — $${p.contract.salary}M/yr.` };
  }
  coach.trustInUser = clamp(coach.trustInUser - 2, 0, 100);
  return { success: false, line: "Not yet. Keep producing and we'll talk." };
}

// "Send me down": ask to drop a minor level for more reps/easier
// competition. Mostly granted if a lower level exists — coaches are
// generally willing to let a struggling player find their footing.
function requestDemotion(state, team, p) {
  const coach = getTeamCoach(team);
  if (!MINOR_LEVELS.includes(p.level)) return { success: false, line: "There's nowhere lower for you to go from here." };
  const idx = MINOR_LEVELS.indexOf(p.level);
  if (idx <= 0) return { success: false, line: "You're already at the bottom rung." };
  const success = Math.random() < 0.75;
  if (success) {
    const prev = MINOR_LEVELS[idx - 1];
    removeFromCurrentRoster(state, p);
    assignToMinorTeam(state, p, prev, p.orgId);
    p.contract = generateContract(p, prev, p.contract ? p.contract.years : 1);
    addNews(state, `${p.name} is sent down to ${prev} to work on his game.`);
    coach.trustInUser = clamp(coach.trustInUser + 1, 0, 100);
    return { success: true, line: `Alright — get some reps in at ${prev} and come back stronger.` };
  }
  return { success: false, line: "I'd rather keep you here for now." };
}

// "Push me up a level": ask for an early promotion. Much harder to get
// than a demotion — needs real trust and performance to back it up.
function requestPromotion(state, team, p) {
  const coach = getTeamCoach(team);
  const ov = overallRating(p);
  if (MINOR_LEVELS.includes(p.level)) {
    const idx = MINOR_LEVELS.indexOf(p.level);
    const chance = clamp((coach.trustInUser - 50) * 0.01 + (ov - 55 - idx * 8) * 0.015, 0.02, 0.5);
    const success = Math.random() < chance;
    if (!success) { coach.trustInUser = clamp(coach.trustInUser - 1, 0, 100); return { success: false, line: "You're not ready for that jump yet. Keep working." }; }
    const next = MINOR_LEVELS[idx + 1];
    if (next) {
      removeFromCurrentRoster(state, p);
      assignToMinorTeam(state, p, next, p.orgId);
      p.contract = generateContract(p, next, p.contract ? p.contract.years : 1);
      addNews(state, `${p.name} is promoted to ${next} after asking for a shot.`);
      return { success: true, line: `You've made your case — you're up to ${next}.` };
    }
    // top of the minors: push for the call-up
    const org = ALL_PRO_TEAMS.find(t => t.id === p.orgId);
    removeFromCurrentRoster(state, p);
    p.level = org ? org.league : "MLB";
    p.teamId = p.orgId;
    const bigTeam = state.teams[p.teamId];
    if (bigTeam) bigTeam.roster.push(p);
    p.contract = generateContract(p, p.level, 2);
    addNews(state, `CALL-UP! ${p.name} pushed for it and earned the call to the big leagues.`);
    return { success: true, line: `You've made your case — pack your bags, you're going up.` };
  }
  return { success: false, line: "There's nowhere higher to push you right now." };
}
