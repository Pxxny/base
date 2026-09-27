// ============================================================
// DIAMOND LEGACY UI REWORK
// Readability-first screens + player profiles + undrafted free agency
// + manager-only trade deadline + livelier field runner animations.
// ============================================================

let PLAYER_PROFILE_ID = null;
let SCHEDULE_MONTH_FILTER = "all";
let STANDINGS_LEAGUE_FILTER = null;

function isPlayerManager() {
  try { const m = typeof ensureManagerState === "function" ? ensureManagerState(STATE) : null; return !!(m && m.active && m.role === "Manager"); }
  catch (_) { return false; }
}

function openPlayerProfile(playerOrId) {
  PLAYER_PROFILE_ID = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
  renderAll();
}
function closePlayerProfile() { PLAYER_PROFILE_ID = null; renderAll(); }
function findAnyPlayer(id) {
  if (!id) return null;
  if (STATE?.player?.id === id) return STATE.player;
  for (const t of Object.values(STATE?.teams || {})) { const p = (t.roster || []).find(x => x.id === id); if (p) return p; }
  return null;
}
function playerButton(p, extra = "") {
  return el("button", { class: `link-player ${extra}`, onclick: () => openPlayerProfile(p.id) }, p.name);
}

function renderPlayerProfileModal() {
  const p = findAnyPlayer(PLAYER_PROFILE_ID);
  if (!p) return null;
  const team = STATE.teams?.[p.teamId] || STATE.teams?.[p.orgId];
  const card = el("div", { class: "profile-modal-backdrop", onclick: e => { if (e.target === e.currentTarget) closePlayerProfile(); } });
  const panel = el("div", { class: "profile-modal" });
  const head = el("div", { class: "profile-modal-head" }, [
    el("div", {}, [el("div", { class: "profile-kicker" }, "PLAYER PROFILE"), el("h2", {}, p.name), el("div", { class: "small-note" }, `${p.position} · Age ${p.age} · ${p.nationality}`)]),
    el("button", { class: "btn secondary", onclick: closePlayerProfile }, "Close")
  ]);
  panel.appendChild(head);
  const overview = el("div", { class: "profile-overview" }, [
    statBox("OVR", overallRating(p)), statBox("POT", p.potential), statBox("TEAM", team?.name || "Free Agent"), statBox("STATUS", p.health?.status || "Healthy")
  ]);
  panel.appendChild(overview);
  const attrs = p.batting ? p.batting : p.pitching;
  const attrCard = el("div", { class: "profile-section" });
  attrCard.appendChild(el("h3", {}, isPitcher(p.position) ? "Pitching Profile" : "Batting Profile"));
  const source = isPitcher(p.position) ? p.pitching : p.batting;
  const entries = source ? Object.entries(source).filter(([k,v]) => typeof v === "number").slice(0, 12) : [];
  if (entries.length) entries.forEach(([k,v]) => attrCard.appendChild(el("div", { class: "attr-bar-row" }, [el("span", { class: "attr-bar-label" }, k.toUpperCase()), el("span", { class: "attr-bar-track" }, el("span", { class: "attr-bar-fill", style: `width:${clamp(Number(v),0,100)}%` })), el("span", { class: "attr-bar-val" }, String(Math.round(v)))])));
  panel.appendChild(attrCard);
  const stats = el("div", { class: "profile-section" });
  stats.appendChild(el("h3", {}, "Season Stats"));
  const s = isPitcher(p.position) ? p.seasonStats?.pitching : p.seasonStats?.batting;
  const statKeys = isPitcher(p.position) ? ["G","GS","W","L","IP","SO","BB","ER"] : ["G","PA","AB","H","2B","3B","HR","RBI","BB","SO"];
  const grid = el("div", { class: "profile-stat-grid" });
  statKeys.forEach(k => grid.appendChild(statBox(k, s?.[k] ?? 0)));
  stats.appendChild(grid); panel.appendChild(stats);
  card.appendChild(panel);
  return card;
}

function positionGroupForRoster(p) {
  if (isPitcher(p.position)) return p.position === "SP" ? "Starting Pitchers" : "Relief Pitchers";
  const map = { C:"Catcher", "1B":"Infield", "2B":"Infield", "3B":"Infield", SS:"Infield", LF:"Outfield", CF:"Outfield", RF:"Outfield", DH:"Designated Hitters" };
  return map[p.position] || "Other";
}

function renderRosterView() {
  const p = STATE.player;
  const team = STATE.teams?.[p.teamId] || STATE.teams?.[p.orgId];
  const wrap = el("div", { class: "screen-stack" });
  if (!team) return el("div", { class: "card" }, [el("h2", {}, "Roster"), el("p", { class: "small-note" }, "You are currently without a team roster.")]);

  const roster = [...(team.roster || [])];
  if (!roster.some(x => x.id === p.id) && p.teamId === team.id) roster.push(p);
  const healthy = x => x.health?.status === "Healthy";
  const lineup = buildLineup(team);
  const starters = (lineup?.order || []).map(x => x.player).filter(Boolean);
  const starterIds = new Set(starters.map(x => x.id));
  const starterPitcher = previewStartingPitcher(team);

  const hero = el("div", { class: "roster-hero" }, [
    el("div", {}, [el("div", { class: "profile-kicker" }, "TEAM ROSTER"), el("h1", {}, team.name), el("p", { class: "small-note" }, `${team.city || ""} · ${team.league || ""} · ${roster.length} players`)]),
    el("div", { class: "roster-summary" }, [statBox("STARTERS", starters.length), statBox("SP", starterPitcher ? starterPitcher.name : "—"), statBox("HEALTHY", roster.filter(healthy).length)])
  ]);
  wrap.appendChild(hero);

  const startCard = el("div", { class: "card starting-card" });
  startCard.appendChild(el("div", { class: "section-title-row" }, [el("div", {}, [el("h2", {}, "STARTING LINEUP"), el("p", { class: "small-note" }, "The players who matter most for the next game.")]), el("span", { class: "priority-tag" }, "PRIORITY") ]));
  const startGrid = el("div", { class: "starter-grid" });
  (lineup?.order || []).forEach(slot => {
    const pl = slot.player; if (!pl) return;
    const item = el("button", { class: `starter-card ${pl.id === p.id ? "user" : ""}`, onclick: () => openPlayerProfile(pl.id) }, [
      el("span", { class: "starter-number" }, String(slot.battingOrder)),
      el("span", { class: "starter-position" }, slot.position),
      el("strong", {}, pl.name),
      el("span", { class: "small-note" }, `OVR ${overallRating(pl)} · ${pl.health?.status || "Healthy"}`)
    ]);
    startGrid.appendChild(item);
  });
  if (starterPitcher) startGrid.appendChild(el("button", { class: `starter-card pitcher-start ${starterPitcher.id === p.id ? "user" : ""}`, onclick: () => openPlayerProfile(starterPitcher.id) }, [el("span", { class: "starter-number" }, "P"), el("span", { class: "starter-position" }, "SP"), el("strong", {}, starterPitcher.name), el("span", { class: "small-note" }, `OVR ${overallRating(starterPitcher)}`)]));
  startCard.appendChild(startGrid); wrap.appendChild(startCard);

  const groups = ["Starting Pitchers", "Catcher", "Infield", "Outfield", "Designated Hitters", "Relief Pitchers", "Other"];
  groups.forEach(group => {
    const players = roster.filter(pl => positionGroupForRoster(pl) === group).sort((a,b) => overallRating(b)-overallRating(a));
    if (!players.length) return;
    const c = el("div", { class: "card roster-group" });
    c.appendChild(el("div", { class: "section-title-row" }, [el("h2", {}, group), el("span", { class: "small-note" }, `${players.length} player${players.length === 1 ? "" : "s"}`)]));
    const grid = el("div", { class: "roster-player-grid" });
    players.forEach(pl => {
      const badge = starterIds.has(pl.id) ? "STARTER" : (pl.health?.status !== "Healthy" ? "INJURED" : "DEPTH");
      grid.appendChild(el("button", { class: "roster-player-row", onclick: () => openPlayerProfile(pl.id) }, [
        el("span", { class: "pos-chip" }, pl.position), el("span", { class: "roster-player-name" }, pl.name), el("span", { class: "roster-badge" }, badge), el("span", { class: "roster-ovr" }, String(overallRating(pl)))
      ]));
    });
    c.appendChild(grid); wrap.appendChild(c);
  });
  return wrap;
}

function renderStandingsView() {
  const wrap = el("div", { class: "screen-stack" });
  const mine = STATE.player ? STATE.teams?.[STATE.player.teamId] : null;
  const defaultLeague = STANDINGS_LEAGUE_FILTER || mine?.league || PRO_LEAGUE_CODES[0];
  if (!PRO_LEAGUE_CODES.includes(defaultLeague)) STANDINGS_LEAGUE_FILTER = PRO_LEAGUE_CODES[0];
  const league = STANDINGS_LEAGUE_FILTER || defaultLeague;
  const leagueTeams = STATE.allTeams.filter(t => t.league === league);
  const meta = typeof LEAGUES !== "undefined" ? LEAGUES[league] : null;
  const header = el("div", { class: "screen-header" }, [el("div", {}, [el("div", { class: "profile-kicker" }, "LEAGUE TABLE"), el("h1", {}, meta?.name || league), el("p", { class: "small-note" }, `${meta?.country || ""} · ${leagueTeams.length} teams`)]), el("select", { onchange: e => { STANDINGS_LEAGUE_FILTER = e.target.value; renderAll(); } }, PRO_LEAGUE_CODES.map(code => { const o = el("option", { value: code }, code); if (code === league) o.selected = true; return o; }))]);
  wrap.appendChild(header);
  const table = el("table", { class: "stat-table standings-modern" });
  table.appendChild(el("tr", {}, ["#","Team","W","L","PCT","GB","STRK"].map(h=>el("th",{},h))));
  const sorted = [...leagueTeams].sort((a,b)=>(b.wins-b.losses)-(a.wins-a.losses));
  const leader = sorted[0];
  sorted.forEach((t,i)=>{
    const pct=(t.wins+t.losses)?t.wins/(t.wins+t.losses):0;
    const gb=leader?Math.max(0,((leader.wins-t.wins)+(t.losses-leader.losses))/2):0;
    const tr=el("tr",{class:STATE.player?.teamId===t.id?"user-row standings-user":""},[el("td",{},String(i+1)),el("td",{class:"team-cell"},[el("strong",{},t.name),el("span",{class:"small-note"},t.city||"")]),el("td",{},String(t.wins)),el("td",{},String(t.losses)),el("td",{},fmt3(pct)),el("td",{},i===0?"—":gb.toFixed(1)),el("td",{},"—")]);
    table.appendChild(tr);
  });
  const card=el("div",{class:"card"}); card.appendChild(table); wrap.appendChild(card);
  return wrap;
}

function scheduleMonthLabel(day) { return `Month ${Math.floor(Math.max(1, Number(day||1)-1)/30)+1}`; }
function renderScheduleView() {
  const log=ensureUserSchedule(STATE); const wrap=el("div",{class:"screen-stack"});
  const wins=log.filter(g=>g.resultLabel==="W").length, losses=log.filter(g=>g.resultLabel==="L").length, ties=log.filter(g=>g.resultLabel==="T").length;
  const months=[...new Set(log.map(g=>scheduleMonthLabel(g.day)))];
  const header=el("div",{class:"screen-header"},[el("div",{},[el("div",{class:"profile-kicker"},"TEAM SCHEDULE"),el("h1",{},"Schedule"),el("p",{class:"small-note"},`${wins}-${losses}${ties?`-${ties}`:""} · ${log.length} games`)]),el("div",{class:"month-pills"},[el("button",{class:`pill ${SCHEDULE_MONTH_FILTER==="all"?"active":""}`,onclick:()=>{SCHEDULE_MONTH_FILTER="all";renderAll();}},"All"),...months.map(m=>el("button",{class:`pill ${SCHEDULE_MONTH_FILTER===m?"active":""}`,onclick:()=>{SCHEDULE_MONTH_FILTER=m;renderAll();}},m))])]);
  wrap.appendChild(header);
  const groups={}; log.forEach((g,i)=>{const m=scheduleMonthLabel(g.day); if(SCHEDULE_MONTH_FILTER!=="all"&&m!==SCHEDULE_MONTH_FILTER)return;(groups[m]??=[]).push([g,i]);});
  Object.entries(groups).forEach(([month,items])=>{const c=el("div",{class:"card month-card"});c.appendChild(el("h2",{},month));const list=el("div",{class:"schedule-list"});items.sort((a,b)=>a[0].day-b[0].day).forEach(([g,i])=>{const color=g.resultLabel==="W"?"win":g.resultLabel==="L"?"lose":"tie";const row=el("button",{class:"schedule-row",onclick:()=>{SCHEDULE_DRILLDOWN_INDEX=SCHEDULE_DRILLDOWN_INDEX===i?null:i;renderAll();}},[el("span",{class:"schedule-day"},`DAY ${g.day}`),el("span",{class:"schedule-opp"},`${g.isHome?"vs":"@"} ${g.opponentName}`),el("strong",{class:`schedule-result ${color}`},`${g.resultLabel} ${g.userScore}-${g.oppScore}`)]);list.appendChild(row);if(SCHEDULE_DRILLDOWN_INDEX===i){list.appendChild(el("div",{class:"schedule-detail"},`SP: ${g.userStartingPitcher||"—"} · Opp SP: ${g.oppStartingPitcher||"—"}${g.winningPitcher?` · W: ${g.winningPitcher}`:""}${g.losingPitcher?` · L: ${g.losingPitcher}`:""}`));}});c.appendChild(list);wrap.appendChild(c);});
  if(!log.length)wrap.appendChild(el("div",{class:"card empty-state"},[el("h3",{},"No games yet"),el("p",{},"Play or simulate a game to build your schedule.")]));
  return wrap;
}

function renderGameDayView() {
  const gv=GAME_VIEW;
  const wrap=el("div",{class:"screen-stack gameday-screen"});
  if(!gv)return el("div",{class:"card empty-state"},[el("h2",{},"Game Day"),el("p",{},"No game is currently open."),el("button",{class:"btn amber",onclick:()=>{startGameDay();renderAll();}},"Open Today's Game")]);
  const result=gv.result; const scoreAway=gv.finished?result.awayScore:(gv.paIndex>0?result.game.pitchLog?.[gv.paIndex-1]?.scoreAfter?.away||0:0); const scoreHome=gv.finished?result.homeScore:(gv.paIndex>0?result.game.pitchLog?.[gv.paIndex-1]?.scoreAfter?.home||0:0); const current=result.game.pitchLog?.[gv.paIndex];
  const score=el("div",{class:"gameday-scoreboard"},[el("div",{class:"score-team"},[el("span",{class:"score-label"},"AWAY"),el("strong",{},result.awayTeam.name),el("b",{},scoreAway)]),el("div",{class:"inning-display"},[el("span",{},current?`${current.half==="top"?"TOP":"BOT"} ${current.inning}`:"FINAL"),el("small",{},current?"INNING":"GAME")]),el("div",{class:"score-team"},[el("span",{class:"score-label"},"HOME"),el("strong",{},result.homeTeam.name),el("b",{},scoreHome)])]);
  wrap.appendChild(score);
  wrap.appendChild(renderLiveGameCard(gv));
  return wrap;
}

// Manager-only trade UI. Players who are not managers should not see deadline controls.
function renderRivalryTransactions() {
  ensureCareerSystems(STATE); const wrap=el("div");
  const rr=Object.values(STATE.rivalries||{}).filter(r=>r.meetings>=2).sort((a,b)=>b.shutDowns-a.shutDowns).slice(0,6);
  if(rr.length){const rc=el("div",{class:"card"});rc.appendChild(el("h2",{},"Rivalry Matchups"));rr.forEach(r=>rc.appendChild(el("div",{class:"news-item"},`${r.name} — ${r.shutDowns} shutdowns · ${r.meetings} meetings`)));wrap.appendChild(rc);}
  if(!isPlayerManager()) return wrap;
  const tc=el("div",{class:"card manager-deadline"});tc.appendChild(el("div",{class:"section-title-row"},[el("h2",{},"Trade Deadline"),el("span",{class:"priority-tag"},"MANAGER ONLY")]));
  const pendingT=STATE.tradeOffers.filter(x=>x.status==="pending");
  if(!pendingT.length)tc.appendChild(el("p",{class:"small-note"},"No pending trade proposals."));
  pendingT.forEach(o=>{const from=STATE.teams[o.fromTeamId],target=STATE.teams[STATE.player.teamId]?.roster.find(x=>x.id===o.targetPlayerId),incoming=from?.roster.find(x=>x.id===o.offeredPlayerId);tc.appendChild(el("div",{class:"news-item"},[el("div",{},`${from?.name||"Rival"} offers ${incoming?.name||"a player"} for ${target?.name||"your player"}.`),el("div",{class:"btn-row"},[el("button",{class:"btn amber",onclick:()=>acceptTradeOffer(o.id)},"Accept"),el("button",{class:"btn secondary",onclick:()=>rejectTradeOffer(o.id)},"Reject")])]));});
  wrap.appendChild(tc);return wrap;
}

// Undrafted players can contact any top-level league instead of being auto-assigned.
function screenFreeAgentOffers() {
  const p=STATE.player; const wrap=el("div",{class:"screen-stack"});
  ensureCareerSystems(STATE); STATE.freeAgentOffers ||= [];
  const header=el("div",{class:"screen-header"},[el("div",{},[el("div",{class:"profile-kicker"},"FREE AGENCY"),el("h1",{},"Find Your Team"),el("p",{class:"small-note"},"You went undrafted. Send your own offer to any top-level league. Clubs may accept based on your profile.")])]);wrap.appendChild(header);
  const sent=new Set(STATE.freeAgentOffers.filter(x=>x.status==="sent").map(x=>x.teamId));
  const accepted=STATE.freeAgentOffers.find(x=>x.status==="accepted");
  if(accepted){const team=STATE.teams[accepted.teamId];wrap.appendChild(el("div",{class:"card"},[el("h2",{},"Offer Accepted"),el("p",{},`${team?.name||"A club"} accepted your offer.`),el("button",{class:"btn amber",onclick:()=>{p.teamId=team.id;p.orgId=team.id;p.level="Pro";p.contract=generateContract(p,"Pro",1);rosterAdd(team,p);STATE.phase="season";ACTIVE_TAB="career";renderAll();}},"Join Team →")]));return wrap;}
  PRO_LEAGUE_CODES.forEach(code=>{const teams=STATE.allTeams.filter(t=>t.league===code);const card=el("div",{class:"card"});card.appendChild(el("h2",{},`${code} — ${LEAGUES[code]?.name||code}`));const grid=el("div",{class:"free-agent-team-grid"});teams.forEach(t=>{const sentHere=sent.has(t.id);grid.appendChild(el("div",{class:"fa-team-card"},[el("strong",{},t.name),el("span",{class:"small-note"},`${t.country||""} · ${t.city||""}`),el("button",{class: sentHere ? "btn secondary" : "btn amber",disabled:sentHere,onclick:()=>submitFreeAgentOffer(t.id)},sentHere?"OFFER SENT":"OFFER YOURSELF")]));});card.appendChild(grid);wrap.appendChild(card);});
  return wrap;
}
function submitFreeAgentOffer(teamId){ensureCareerSystems(STATE);STATE.freeAgentOffers ||= [];if(STATE.freeAgentOffers.some(x=>x.teamId===teamId&&x.status==="sent"))return;const team=STATE.teams[teamId];if(!team)return;STATE.freeAgentOffers.push({id:uid(),teamId,status:"sent",day:STATE.day});const score=overallRating(STATE.player)+STATE.player.potential*.15+(Math.random()*20-10);const threshold=42+(team.roster?.length||0)*.01; if(score>=threshold){STATE.freeAgentOffers[STATE.freeAgentOffers.length-1].status="accepted";toast(`${team.name} accepted your offer!`);}else{STATE.freeAgentOffers[STATE.freeAgentOffers.length-1].status="rejected";toast(`${team.name} passed on your offer.`);}renderAll();}

// Keep the existing draft simulation, but route an undrafted player to open free agency.
function screenDraftPrep() {
  const p=STATE.player, wrap=el("div",{class:"screen-stack"});wrap.appendChild(renderPlayerCard(p));const card=el("div",{class:"card"});card.appendChild(el("h2",{},"Pre-Draft Process"));card.appendChild(el("p",{},`Scout Grade: ${scoutGradeLetter(p)} · Potential Ceiling: ${p.potential}/100 · Current Overall: ${overallRating(p)}`));card.appendChild(el("p",{class:"small-note"},"Enter the draft. If you go undrafted, you will be able to contact teams in any top-level league yourself."));card.appendChild(el("button",{class:"btn amber",onclick:()=>{generateDraftClass(STATE,320);const results=runDraft(STATE,10);STATE.phase="draft-results";const mine=results.find(r=>r.player.id===p.id);if(!mine){p.teamId=null;p.orgId=null;p.level="Free Agent";p.contract=null;STATE.phase="free-agent-offers";addNews(STATE,`${p.name} went undrafted and entered open free agency.`);}else addNews(STATE,`DRAFTED! ${p.name} selected Round ${mine.round}, Pick ${mine.pick} by the ${TEAM_NAME(mine.team)}.`);renderAll();}},"Enter the Draft →"));wrap.appendChild(card);wrap.appendChild(renderAttributeCard(p));return wrap;
}

// Extend the router for free-agent screen without disturbing existing career flow.
const _originalRenderMain = typeof renderMain === "function" ? renderMain : null;
function renderMain() {
  const main=document.getElementById("main");main.innerHTML="";if(!STATE)STATE=newGameState();
  if(STATE.phase==="creation")return main.appendChild(screenCreation());
  if(STATE.phase==="mode-select")return main.appendChild(screenModeSelect());
  if(STATE.phase==="hs-season"||STATE.phase==="college-season")return main.appendChild(screenAmateurSeason());
  if(STATE.phase==="draft-prep")return main.appendChild(screenDraftPrep());
  if(STATE.phase==="draft-results")return main.appendChild(screenDraftResults());
  if(STATE.phase==="free-agent-offers")return main.appendChild(screenFreeAgentOffers());
  if(STATE.phase==="team-select")return main.appendChild(screenTeamSelect());
  if(STATE.phase==="season-summary")return main.appendChild(screenSeasonSummary());
  if(STATE.phase==="contract-decision")return main.appendChild(screenContractDecision());
  if(STATE.phase==="season"||STATE.phase==="offseason")return main.appendChild(screenTab(ACTIVE_TAB));
  main.appendChild(el("div",{class:"empty-state"},"Loading..."));
}

// Final player-profile layer and new screens are appended after every normal render.
const _baseRenderAll = renderAll;
function renderAll() {
  _baseRenderAll();
  const main=document.getElementById("main");
  if(PLAYER_PROFILE_ID && main){const modal=renderPlayerProfileModal();if(modal)document.body.appendChild(modal);}
  document.querySelectorAll(".profile-modal-backdrop").forEach(x=>{if(x!==document.querySelector(".profile-modal-backdrop:last-of-type"))x.remove();});
}

// Re-render once after this override script loads so the new UI is visible
// immediately, not only after the first user interaction.
try { renderAll(); } catch (e) { console.error("UI rework bootstrap error", e); }
