// ============================================================
// STADIUM DATA
// ============================================================
// Stadium names live on each team record in mlb-teams.js / npb-teams.js /
// kbo-teams.js (team.stadium). This module provides a simple lookup and a
// couple of cosmetic capacity figures used for flavor text in the sim/box
// score views. Capacities are approximate and for gameplay flavor only.

const STADIUM_CAPACITY = {
  "Yankee Stadium": 46537, "Fenway Park": 37755, "Rogers Centre": 41168, "Tropicana Field": 25000,
  "Oriole Park at Camden Yards": 44970, "Progressive Field": 34830, "Target Field": 38544,
  "Guaranteed Rate Field": 40615, "Comerica Park": 41083, "Kauffman Stadium": 37903,
  "Minute Maid Park": 41168, "T-Mobile Park": 47929, "Globe Life Field": 40300,
  "Angel Stadium": 45050, "Sutter Health Park": 14014, "Truist Park": 41084,
  "Citizens Bank Park": 42901, "Citi Field": 41922, "loanDepot Park": 36742,
  "Nationals Park": 41339, "American Family Field": 41900, "Wrigley Field": 41649,
  "Busch Stadium": 44494, "Great American Ball Park": 42319, "PNC Park": 38747,
  "Dodger Stadium": 56000, "Petco Park": 40209, "Oracle Park": 41265,
  "Chase Field": 48519, "Coors Field": 50144,
  "Tokyo Dome": 55000, "Koshien Stadium": 47508, "Vantelin Dome Nagoya": 36123,
  "Mazda Stadium": 33090, "Meiji Jingu Stadium": 31805, "Yokohama Stadium": 34046,
  "Fukuoka PayPay Dome": 40507, "Kyocera Dome Osaka": 36154, "ZOZO Marine Stadium": 30118,
  "Rakuten Seimei Park Miyagi": 30508, "Belluna Dome": 33556, "Es Con Field Hokkaido": 35000,
  "Jamsil Baseball Stadium": 23750, "Gocheok Sky Dome": 16813, "Incheon SSG Landers Field": 23000,
  "Changwon NC Park": 22000, "Gwangju-Kia Champions Field": 20500, "Daegu Samsung Lions Park": 24000,
  "Sajik Baseball Stadium": 28000, "Daejeon Hanwha Life Eagles Park": 20000, "Suwon KT Wiz Park": 20000
};

function stadiumCapacity(name) {
  return STADIUM_CAPACITY[name] || 20000;
}
