// ============================================================
// LEAGUE NEWS
// ============================================================
// Depends on js/leagues.js (uid).

function addNews(state, headline, body = "") {
  state.news.unshift({ id: uid(), year: state.year, day: state.day, headline, body });
  if (state.news.length > 200) state.news.pop();
}

// ---- News UI view ----
function renderNewsView() {
  const card = el("div", { class: "card" });
  card.appendChild(el("h2", {}, "League News"));
  for (const n of STATE.news.slice(0, 40)) {
    card.appendChild(el("div", { class: "news-item" }, [
      el("div", { class: "headline" }, n.headline),
      el("div", { class: "meta" }, `Year ${n.year}, Day ${n.day}`)
    ]));
  }
  if (!STATE.news.length) card.appendChild(el("p", { class: "small-note" }, "No news yet."));
  return card;
}
