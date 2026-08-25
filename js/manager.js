// ============================================================
// MANAGER / COACHING CAREER
// ============================================================
// Lets the player leave the on-field career track and build a coaching
// career: Assistant Coach -> Bench Coach -> Manager. A manager can set a
// lineup, choose game strategy, draft prospects and sign young players.

const MANAGER_ROLES = {
  "Assistant Coach": { minYears: 0, next: "Bench Coach" },
  "Bench Coach": { minYears: 2, next: "Manager" },
  "Manager": { minYears: 0, next: null }
};

function ensureManagerState(state) {
  state.manager ||= {
    active: false,
    role: null,
    teamId: null,
    experienceYears: 0,
    experienceDays: 0,
    reputation: 35,
    strategy: "Balanced",
    lineupIds: [],
    lineupPositions: {},
    draftBoard: [],
    prospectPool: [],
    transactions: [],
    awards: [],
    fired: false,
    jobHistory: []
  };
  return state.manager;
}

function managerExperienceEligibility(state) {
  const p = state.player || {};
  const years = p.yearsPro || 0;
  const age = p.age || 0;
  return {
    assistant: age >= 24 || years >= 2 || p.retired,
    manager: age >= 28 || years >= 5 || p.retired || (state.manager && state.manager.experienceYears >= 2)
  };
}

function enterCoachingCareer(state, teamId, role = "Assistant Coach") {
  ensureManagerState(state);
  const elig = managerExperienceEligibility(state);
  if (role === "Manager" && !elig.manager) {
    toast("You need more baseball/coaching experience before becoming a manager.");
    return false;
  }
  if (role === "Assistant Coach" && !elig.assistant) {
    toast("You need more playing experience before joining a coaching staff.");
    return false;
  }
  const team = state.teams[teamId];
  if (!team) return false;
  const m = state.manager;
  m.active = true;
  m.role = role;
  m.teamId = teamId;
  m.experienceDays = m.experienceDays || 0;
  m.experienceYears = m.experienceYears || 0;
  m.reputation = m.reputation || 35;
  m.fired = false;
  team.manager = { name: state.player?.name || "Player Manager", role, reputation: m.reputation };
  if (!m.lineupIds.length) seedManagerLineup(state, team);
  addNews(state, `${state.player?.name || "A new coach"} joins the ${team.name} staff as ${role}.`);
  ACTIVE_TAB = "manager";
  renderAll();
  return true;
}

function seedManagerLineup(state, team) {
  const eligible = (team.roster || []).filter(p => !isPitcher(p.position) && p.health?.status === "Healthy");
  eligible.sort((a,b) => battingOverall(b)-battingOverall(a));
  const chosen = eligible.slice(0, 9);
  state.manager.lineupIds = chosen.map(p => p.id);
  state.manager.lineupPositions = {};
  chosen.forEach((p, i) => state.manager.lineupPositions[p.id] = p.position || ["C","1B","2B","3B","SS","LF","CF","RF","DH"][i]);
}

function managerLineupForTeam(team) {
  const m = STATE?.manager;
  if (!m?.active || m.role !== "Manager" || m.teamId !== team.id) return null;
  const players = m.lineupIds.map(id => (team.roster || []).find(p => p.id === id)).filter(Boolean);
  const healthy = players.filter(p => !isPitcher(p.position) && p.health?.status === "Healthy");
  if (healthy.length < 9) return null;
  const order = healthy.slice(0,9).map((p,i) => ({
    player:p,
    position:m.lineupPositions?.[p.id] || p.position,
    battingOrder:i+1
  }));
  return { coach: { name: stateManagerName(), personality: "Player Manager", trustInUser: 100 }, order };
}
function stateManagerName() { return STATE?.player?.name || "Player Manager"; }

function managerSetLineup(state, ids) {
  const m = ensureManagerState(state);
  const team = state.teams[m.teamId];
  if (!team || m.role !== "Manager") return false;
  const valid = ids.map(id => team.roster.find(p=>p.id===id)).filter(p => p && !isPitcher(p.position) && p.health?.status === "Healthy");
  if (valid.length !== 9) { toast("A legal lineup needs 9 healthy position players."); return false; }
  m.lineupIds = valid.map(p=>p.id);
  valid.forEach((p,i)=> { m.lineupPositions[p.id] = p.position; });
  toast("Starting lineup saved.");
  renderAll();
  return true;
}

function managerSetStrategy(state, strategy) {
  const m = ensureManagerState(state);
  if (!m.active) return;
  m.strategy = strategy;
  toast(`Game plan set to ${strategy}.`);
  renderAll();
}

function managerGenerateDraftBoard(state, count=30) {
  const m = ensureManagerState(state);
  if (m.role !== "Manager") return;
  const prospects=[];
  for(let i=0;i<count;i++){
    const age=rnd(18,22);
    const p=createPlayer({age,levelHint:rnd(35,65)});
    p.level="Draft Prospect";
    p.draftInfo={projection:clamp(overallRating(p)+p.potential*.3+rnd(-8,8),1,100)};
    prospects.push(p);
  }
  prospects.sort((a,b)=>b.draftInfo.projection-a.draftInfo.projection);
  m.draftBoard=prospects;
  toast("New scouting class is ready.");
  renderAll();
}

function managerDraftPlayer(state, index) {
  const m=ensureManagerState(state);
  const team=state.teams[m.teamId];
  if(m.role!=="Manager" || !team || !m.draftBoard[index]) return;
  const p=m.draftBoard.splice(index,1)[0];
  p.teamId=team.id; p.orgId=team.orgId || team.id; p.level=team.league;
  p.contract=generateContract(p,"Rookie",1);
  team.roster.push(p);
  m.transactions.push({day:state.day,type:"Draft",playerId:p.id,playerName:p.name,teamId:team.id});
  m.reputation=clamp(m.reputation+1,0,100);
  addNews(state, `${team.name} selects ${p.name}, a ${Math.round(p.draftInfo?.projection||overallRating(p))} projection prospect.`);
  toast(`${p.name} drafted.`);
  renderAll();
}

function managerGenerateProspects(state,count=8){
  const m=ensureManagerState(state); if(m.role!=="Manager") return;
  m.prospectPool=[];
  for(let i=0;i<count;i++){
    const age=rnd(16,20);
    const p=createPlayer({age,levelHint:rnd(25,55)});
    p.level="Amateur Prospect";
    p.scouting={grade:Math.round(overallRating(p)+p.potential*.25+rnd(-6,6))};
    m.prospectPool.push(p);
  }
  m.prospectPool.sort((a,b)=>b.scouting.grade-a.scouting.grade);
  toast("Scouts found new young prospects."); renderAll();
}

function managerSignProspect(state,index){
  const m=ensureManagerState(state), team=state.teams[m.teamId];
  if(m.role!=="Manager"||!team||!m.prospectPool[index]) return;
  const p=m.prospectPool.splice(index,1)[0];
  p.teamId=team.id; p.orgId=team.orgId||team.id; p.level=team.league; p.contract=generateContract(p,"Prospect",2);
  team.roster.push(p);
  m.transactions.push({day:state.day,type:"Prospect Signing",playerId:p.id,playerName:p.name,teamId:team.id});
  addNews(state, `${team.name} signs  ${p.name}, a young prospect identified by its scouting department.`);
  toast(`${p.name} signed.`); renderAll();
}

function managerDailyUpdate(state){
  const m=state.manager;
  if(!m?.active) return;
  m.experienceDays++;
  if(m.experienceDays % 138 === 0){
    m.experienceYears++;
    m.reputation=clamp(m.reputation+3,0,100);
    if(m.role!=="Manager" && m.experienceYears>=2){
      addNews(state, `${state.player?.name || "The coach"} has earned enough coaching experience to interview for a manager job.`);
      if (Math.random() < 0.65) managerJobOffer(state);
    }
  }
}

function managerJobOffer(state){
  const m=ensureManagerState(state);
  if(m.role!=="Assistant Coach" && m.role!=="Bench Coach") return;
  const elig=managerExperienceEligibility(state);
  if(!elig.manager || m.reputation<45) return;
  const candidates=state.allTeams.filter(t=>t.league && t.league!=="MINORS" && t.id!==m.teamId);
  if(!candidates.length) return;
  const team=pick(candidates);
  m.jobOffer={teamId:team.id,teamName:team.name,role:"Manager"};
  addNews(state, `${team.name} has interviewed ${state.player?.name || "the coach"} for its manager vacancy.`);
}

function renderManagerView(){
  const m=ensureManagerState(STATE), wrap=el("div");
  if(!m.active){
    const card=el("div",{class:"card"});
    card.appendChild(el("h2",{},"Coaching Career"));
    card.appendChild(el("p",{class:"small-note"},"Build a second baseball career: start as an assistant, earn trust, then work toward a manager's office."));
    const elig=managerExperienceEligibility(STATE);
    const teams=(STATE.allTeams||[]).filter(t=>t.league && t.league!=="MINORS").slice(0,12);
    card.appendChild(el("div",{class:"btn-row"},[
      el("button",{class:"btn amber",disabled:!elig.assistant,onclick:()=>enterCoachingCareer(STATE,teams[0]?.id,"Assistant Coach")},"Become Assistant Coach"),
      el("button",{class:"btn secondary",disabled:!elig.manager,onclick:()=>enterCoachingCareer(STATE,teams[0]?.id,"Manager")},"Become Manager")
    ]));
    card.appendChild(el("p",{class:"small-note"},elig.manager?"You have enough experience to interview for a manager role.":"Manager eligibility: roughly age 28+, 5+ pro years, retirement, or 2+ coaching years."));
    wrap.appendChild(card); return wrap;
  }
  const team=STATE.teams[m.teamId];
  const head=el("div",{class:"card"},[
    el("h2",{},`${m.role} — ${team?.name||"Free Agent Coach"}`),
    el("p",{class:"small-note"},`Experience: ${m.experienceYears} years · Reputation: ${Math.round(m.reputation)}/100 · Strategy: ${m.strategy}`)
  ]);
  wrap.appendChild(head);

  if(m.role!=="Manager"){
    const card=el("div",{class:"card"}); card.appendChild(el("h3",{},"Coaching Path"));
    card.appendChild(el("p",{},`Keep working with the staff. After about 2 seasons of coaching experience and a good reputation, manager interviews can appear.`));
    if(m.role === "Assistant Coach" && m.experienceYears >= 1) card.appendChild(el("button",{class:"btn secondary",onclick:()=>{m.role="Bench Coach";addNews(STATE,`${stateManagerName()} is promoted to Bench Coach after earning the staff's trust.`);renderAll();}},"Earn Promotion: Bench Coach"));
    if(m.jobOffer) card.appendChild(el("button",{class:"btn amber",onclick:()=>{m.role="Manager";m.teamId=m.jobOffer.teamId;m.jobOffer=null;STATE.teams[m.teamId].manager={name:stateManagerName(),role:"Manager",reputation:m.reputation};seedManagerLineup(STATE,STATE.teams[m.teamId]);addNews(STATE,`${stateManagerName()} is hired as manager of ${STATE.teams[m.teamId].name}.`);renderAll();}},`Accept ${m.jobOffer.teamName} Manager Job`));
    wrap.appendChild(card); return wrap;
  }

  const lineupCard=el("div",{class:"card"}); lineupCard.appendChild(el("h3",{},"Starting Lineup"));
  const bats=(team.roster||[]).filter(p=>!isPitcher(p.position)&&p.health?.status==="Healthy").sort((a,b)=>battingOverall(b)-battingOverall(a));
  const selected=new Set(m.lineupIds);
  const rows=bats.map(p=>el("label",{class:"small-note",style:"display:block;margin:6px 0"},[
    el("input",{type:"checkbox",checked:selected.has(p.id),onchange:(e)=>{if(e.target.checked)selected.add(p.id);else selected.delete(p.id);}}),
    ` ${p.name} — ${p.position} — OVR ${overallRating(p)}`
  ]));
  lineupCard.appendChild(el("div",{},rows));
  lineupCard.appendChild(el("button",{class:"btn amber",onclick:()=>managerSetLineup(STATE,[...selected])},"Save Lineup"));
  wrap.appendChild(lineupCard);

  const strategy=el("div",{class:"card"}); strategy.appendChild(el("h3",{},"Game Plan"));
  for(const s of ["Balanced","Aggressive","Small Ball","Power","Pitching & Defense","Development"]){
    strategy.appendChild(el("button",{class:`btn ${m.strategy===s?"amber":"secondary"}`,style:"margin:4px",onclick:()=>managerSetStrategy(STATE,s)},s));
  }
  wrap.appendChild(strategy);

  const draft=el("div",{class:"card"}); draft.appendChild(el("h3",{},"Draft Room"));
  draft.appendChild(el("button",{class:"btn secondary",onclick:()=>managerGenerateDraftBoard(STATE)},"Run Scouting / Generate Draft Board"));
  (m.draftBoard||[]).slice(0,10).forEach((p,i)=>draft.appendChild(el("div",{class:"small-note",style:"margin:7px 0"},[
    `${i+1}. ${p.name} · ${p.position} · Projection ${Math.round(p.draftInfo?.projection||0)} `,
    el("button",{class:"btn amber",style:"margin-left:8px",onclick:()=>managerDraftPlayer(STATE,i)},"Draft")
  ])));
  wrap.appendChild(draft);

  const prospects=el("div",{class:"card"}); prospects.appendChild(el("h3",{},"Scouting & Young Prospects"));
  prospects.appendChild(el("button",{class:"btn secondary",onclick:()=>managerGenerateProspects(STATE)},"Send Scouts Out"));
  (m.prospectPool||[]).slice(0,8).forEach((p,i)=>{
    const row=el("div",{class:"small-note",style:"margin:7px 0"},`${p.name} · Age ${p.age} · ${p.position} · Scout Grade ${p.scouting?.grade||0}`);
    row.appendChild(el("button",{class:"btn amber",style:"margin-left:8px",onclick:()=>managerSignProspect(STATE,i)},"Sign"));
    prospects.appendChild(row);
  });
  wrap.appendChild(prospects);
  return wrap;
}
