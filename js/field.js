// ============================================================
// ENHANCED LIVE BASEBALL FIELD
// ============================================================
// Visual field renderer for Game Day. Keeps gameplay state in career.js but
// renders a more realistic diamond, dirt/grass areas, defensive positions,
// bases, runners, pitcher, batter and simple motion animations.

const FIELD_POSITIONS = {
  P:  { x: 300, y: 315 },
  C:  { x: 300, y: 405 },
  '1B': { x: 510, y: 300 },
  '2B': { x: 300, y: 185 },
  '3B': { x: 90, y: 300 },
  SS: { x: 205, y: 235 },
  LF: { x: 105, y: 95 },
  CF: { x: 300, y: 60 },
  RF: { x: 495, y: 95 },
  DH: { x: 300, y: 430 }
};

const FIELD_BASES = {
  1: { x: 430, y: 300 },
  2: { x: 300, y: 170 },
  3: { x: 170, y: 300 },
  0: { x: 300, y: 430 }
};

function fieldShortName(player) {
  if (!player) return "";
  const parts = String(player.name || "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function fieldCreateSvg(tag, attrs = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
}

function fieldTeamForHalf(currentHalf, result) {
  if (!currentHalf || !result) return null;
  return currentHalf.half === "top" ? result.homeTeam : result.awayTeam;
}

function fieldLineupForTeam(team, result) {
  if (!team || !result) return [];
  const lineup = team.id === result.homeTeam.id ? result.homeLineup : result.awayLineup;
  return lineup?.order || [];
}

function renderEnhancedFieldDiagram(currentHalf, currentPA, result, gv) {
  const box = el("div", { class: "real-field-wrap" });
  if (!currentPA || !result) return box;

  const pitchLog = result.game?.pitchLog || [];
  const paIdx = pitchLog.indexOf(currentPA);
  const prevPA = paIdx > 0 ? pitchLog[paIdx - 1] : null;
  const sameHalfPrev = prevPA && prevPA.inning === currentPA.inning && prevPA.half === currentPA.half ? prevPA : null;
  const outcomePhase = gv?.animPhase === "outcome";
  const bases = outcomePhase ? (currentPA.basesAfter || [null, null, null]) : (sameHalfPrev?.basesAfter || [null, null, null]);
  const outs = outcomePhase ? (currentPA.outsAfter || 0) : (sameHalfPrev?.outsAfter || 0);
  const fieldingTeam = fieldTeamForHalf(currentHalf, result);
  const fielders = fieldLineupForTeam(fieldingTeam, result);
  const isThrowing = gv?.animPhase === "pitching";
  const isUserPitcher = STATE?.player && currentPA.pitcher?.id === STATE.player.id;
  const lastPitch = currentPA.pitches?.[(gv?.pitchIndex || 0) - 1] || null;

  const NS = "http://www.w3.org/2000/svg";
  const svg = fieldCreateSvg("svg", { viewBox: "0 0 600 470", class: "real-field", role: "img", "aria-label": "Live baseball field" });

  // Outfield + warning track + infield dirt.
  svg.appendChild(fieldCreateSvg("rect", { x: 0, y: 0, width: 600, height: 470, rx: 18, class: "field-grass" }));
  svg.appendChild(fieldCreateSvg("path", { d: "M18 300 C45 95 190 20 300 20 C410 20 555 95 582 300 L582 450 L18 450 Z", class: "field-warning" }));
  svg.appendChild(fieldCreateSvg("polygon", { points: "300,155 465,300 300,445 135,300", class: "field-dirt" }));
  svg.appendChild(fieldCreateSvg("polygon", { points: "300,185 430,300 300,415 170,300", class: "field-infield" }));
  svg.appendChild(fieldCreateSvg("line", { x1: 300, y1: 430, x2: 55, y2: 190, class: "foul-line" }));
  svg.appendChild(fieldCreateSvg("line", { x1: 300, y1: 430, x2: 545, y2: 190, class: "foul-line" }));

  // Defensive players: always place them by their actual defensive slot.
  const used = new Set();
  for (const slot of fielders) {
    const pos = slot.position || slot.player?.position;
    const coord = FIELD_POSITIONS[pos];
    if (!coord || used.has(pos) || !slot.player) continue;
    used.add(pos);
    const g = fieldCreateSvg("g", { class: `field-player ${pos === "P" ? "pitcher-player" : ""}` });
    const circle = fieldCreateSvg("circle", { cx: coord.x, cy: coord.y, r: 17, class: "field-player-dot" });
    const text = fieldCreateSvg("text", { x: coord.x, y: coord.y + 4, class: "field-player-initial" });
    text.textContent = fieldShortName(slot.player);
    const label = fieldCreateSvg("text", { x: coord.x, y: coord.y + 31, class: "field-player-label" });
    label.textContent = pos;
    g.append(circle, text, label);
    svg.appendChild(g);
  }

  // Pitcher is the actual pitcher from the PA, so manager/player-controlled
  // games do not visually put a random roster player on the mound.
  if (currentPA.pitcher) {
    const coord = FIELD_POSITIONS.P;
    const g = fieldCreateSvg("g", { class: `field-player ${isThrowing ? "field-player-throwing" : ""}` });
    const circle = fieldCreateSvg("circle", { cx: coord.x, cy: coord.y, r: 19, class: "field-pitcher-dot" });
    const text = fieldCreateSvg("text", { x: coord.x, y: coord.y + 4, class: "field-player-initial" });
    text.textContent = fieldShortName(currentPA.pitcher);
    g.append(circle, text);
    svg.appendChild(g);
  }

  // Bases + runners. Occupied bases show the runner number rather than only a
  // colored square, making the base state readable at a glance.
  [1, 2, 3, 0].forEach(baseNo => {
    const c = FIELD_BASES[baseNo];
    const occupied = baseNo === 0 ? false : !!bases[baseNo - 1];
    svg.appendChild(fieldCreateSvg("rect", {
      x: c.x - 11, y: c.y - 11, width: 22, height: 22,
      transform: `rotate(45 ${c.x} ${c.y})`, class: `field-base ${occupied ? "occupied" : ""}`
    }));
    const label = fieldCreateSvg("text", { x: c.x, y: c.y + 4, class: "field-base-label" });
    label.textContent = baseNo === 0 ? "H" : baseNo;
    svg.appendChild(label);
    if (occupied) {
      const runner = fieldCreateSvg("circle", { cx: c.x, cy: c.y - 25, r: 7, class: "runner-dot" });
      svg.appendChild(runner);
    }
  });

  // Batter and home-plate area.
  const batterX = 326, batterY = 418;
  const batter = fieldCreateSvg("g", { class: `batter-player ${gv?.animPhase === "pitching" ? "batter-ready" : ""}` });
  batter.appendChild(fieldCreateSvg("circle", { cx: batterX, cy: batterY, r: 17, class: "batter-dot-real" }));
  const bt = fieldCreateSvg("text", { x: batterX, y: batterY + 4, class: "field-player-initial" });
  bt.textContent = fieldShortName(currentPA.batter);
  batter.appendChild(bt);
  svg.appendChild(batter);

  // Ball trajectory + bat motion.
  if (isThrowing) {
    const ball = fieldCreateSvg("circle", { cx: 300, cy: 315, r: 5, class: "real-pitch-ball" });
    svg.appendChild(ball);
    const bat = fieldCreateSvg("line", { x1: 327, y1: 418, x2: 365, y2: 395, class: "real-bat-swing" });
    svg.appendChild(bat);
  }

  // Contact animation: once the PA resolves, show the ball leaving the bat
  // and runners actually moving around the bases. This is intentionally
  // lightweight SVG animation so it remains smooth on iPad/mobile.
  if (outcomePhase && ["1B","2B","3B","HR"].includes(currentPA.result)) {
    const ball = fieldCreateSvg("circle", { cx: 326, cy: 418, r: 5, class: "field-hit-ball" });
    const ballPath = fieldCreateSvg("path", { d: currentPA.result === "HR" ? "M326 418 Q390 260 300 55" : currentPA.result === "2B" ? "M326 418 Q430 350 510 190" : currentPA.result === "3B" ? "M326 418 Q235 330 85 170" : "M326 418 Q365 330 430 300", class: "field-motion-path" });
    const motion = fieldCreateSvg("animateMotion", { dur: "0.75s", fill: "freeze", path: ballPath.getAttribute("d") });
    ball.appendChild(motion);
    svg.appendChild(ball);

    const runFromTo = (from, to, cls) => {
      const f = FIELD_BASES[from], t = FIELD_BASES[to];
      if (!f || !t) return;
      const runner = fieldCreateSvg("circle", { cx: f.x, cy: f.y, r: 7, class: `field-runner-moving ${cls || ""}` });
      const path = `M${f.x} ${f.y} L${t.x} ${t.y}`;
      runner.appendChild(fieldCreateSvg("animateMotion", { dur: "0.8s", begin: "0.05s", fill: "freeze", path }));
      svg.appendChild(runner);
    };
    const beforeBases = sameHalfPrev?.basesAfter || [null, null, null];
    if (beforeBases[2]) runFromTo(3, 0, "runner-score");
    if (beforeBases[1]) runFromTo(2, 3, "runner-advance");
    if (beforeBases[0]) runFromTo(1, 2, "runner-advance");
    if (currentPA.result === "HR") {
      runFromTo(1, 0, "runner-score");
      runFromTo(2, 0, "runner-score");
      runFromTo(3, 0, "runner-score");
    } else {
      const target = currentPA.result === "2B" ? 2 : currentPA.result === "3B" ? 3 : 1;
      const f = FIELD_BASES[0], t = FIELD_BASES[target];
      const batterRun = fieldCreateSvg("circle", { cx: f.x, cy: f.y, r: 8, class: "field-runner-moving batter-running" });
      batterRun.appendChild(fieldCreateSvg("animateMotion", { dur: "0.9s", fill: "freeze", path: `M${f.x} ${f.y} L${t.x} ${t.y}` }));
      svg.appendChild(batterRun);
    }
  }

  box.appendChild(svg);

  const info = el("div", { class: "real-field-info" });
  const header = el("div", { class: "real-field-header" }, [
    el("strong", {}, `${currentHalf?.half === "top" ? "Top" : "Bottom"} ${currentPA.inning}`),
    el("span", {}, `${fieldingTeam?.name || "Fielding Team"} · ${outs} out${outs === 1 ? "" : "s"}`)
  ]);
  info.appendChild(header);
  info.appendChild(el("div", { class: "field-matchup" }, [
    el("div", {}, [el("span", { class: "field-info-lbl" }, "BATTER"), el("strong", {}, currentPA.batter?.name || "—")]),
    el("div", {}, [el("span", { class: "field-info-lbl" }, "PITCHER"), el("strong", {}, currentPA.pitcher?.name || "—")])
  ]));
  const count = lastPitch ? `${lastPitch.balls}-${lastPitch.strikes}` : "0-0";
  const pitchLabel = lastPitch ? `${lastPitch.type} · ${lastPitch.mph} mph` : "Ready";
  info.appendChild(el("div", { class: "field-live-stats" }, [
    statBox("COUNT", count), statBox("PITCH", pitchLabel), statBox("OUTS", outs)
  ]));

  if (isUserPitcher && currentPA.pitcher.pitchTypes?.length && !gv.finished && gv.pitchIndex < currentPA.pitches.length) {
    const pitchCard = el("div", { class: "pitch-call-card" });
    pitchCard.appendChild(el("div", { class: "field-info-lbl" }, "CALL NEXT PITCH"));
    const row = el("div", { class: "pitch-choice-row" });
    const selected = gv.selectedPitchType || currentPA.pitches[gv.pitchIndex]?.type;
    currentPA.pitcher.pitchTypes.forEach(type => row.appendChild(el("button", {
      class: `btn secondary pitch-choice ${selected === type ? "selected" : ""}`,
      onclick: () => setLivePitchCall(type)
    }, type)));
    pitchCard.appendChild(row);
    info.appendChild(pitchCard);
  }

  if (gv?.animPhase === "outcome") {
    const resultText = describePAResult(currentPA.batter, currentPA.result, currentPA.runsScored, currentPA.outsAfter);
    info.appendChild(el("div", { class: `field-result-banner ${currentPA.result === "HR" ? "hr" : currentPA.result === "BB" ? "bb" : currentPA.result === "HIT" ? "hit" : "out"}` }, resultText));
  }

  box.appendChild(info);
  return box;
}
