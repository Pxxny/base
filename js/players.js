// ============================================================
// PLAYER GENERATION DATA
// ============================================================
// Name pools, nationalities, personalities, and position/pitch
// reference tables used by js/player.js when procedurally
// generating players (AI opponents, draft classes, free agents).

// Name pools for procedural generation of AI players / opponents
const FIRST_NAMES_US = ["James","Michael","Chris","Alex","Tyler","Jordan","Ryan","Jake","Matt","Josh","Andrew","Nick","Kevin","Brandon","Justin","Cole","Luke","Ethan","Dylan","Austin","Carlos","Miguel","Luis","Jose","Rafael","Diego","Xavier","Marcus","Trevor","Blake"];
const LAST_NAMES_US = ["Smith","Johnson","Williams","Brown","Garcia","Miller","Davis","Rodriguez","Martinez","Wilson","Anderson","Taylor","Thomas","Hernandez","Moore","Martin","Jackson","Thompson","White","Harris","Clark","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres"];
const FIRST_NAMES_JP = ["Haruto","Yuto","Sota","Riku","Kaito","Yuki","Ren","Sho","Kenta","Daiki","Takumi","Hayato","Ryota","Shun","Kazuki","Naoya","Ryo","Koki","Taiga","Minato"];
const LAST_NAMES_JP = ["Sato","Suzuki","Takahashi","Tanaka","Watanabe","Ito","Yamamoto","Nakamura","Kobayashi","Kato","Yoshida","Yamada","Sasaki","Yamaguchi","Matsumoto","Inoue","Kimura","Hayashi","Shimizu","Saito"];
const FIRST_NAMES_KR = ["Min-jun","Seo-jun","Do-yoon","Ye-jun","Si-woo","Ha-joon","Ju-won","Jun-seo","Ji-ho","Woo-jin","Tae-yang","Kang-min","Sung-min","Jae-hyun","Hyun-woo","Dong-hyun","Young-min","Seung-hyun"];
const LAST_NAMES_KR = ["Kim","Lee","Park","Choi","Jung","Kang","Cho","Yoon","Jang","Lim","Han","Oh","Seo","Shin","Kwon","Hwang","Ahn","Song","Ryu","Hong"];

const NATIONALITIES = ["USA","Dominican Republic","Venezuela","Cuba","Japan","South Korea","Mexico","Puerto Rico","Panama","Curacao","Colombia","Canada","Australia","Taiwan"];

const PERSONALITIES = ["Hard Worker","Natural Talent","Team Leader","Hot Head","Fan Favorite","Quiet Professional","Clutch Performer","Streaky","Perfectionist","Free Spirit"];

const POSITIONS = {
  batters: ["C","1B","2B","3B","SS","LF","CF","RF","DH"],
  pitchers: ["SP","RP","CP"]
};

const PITCH_TYPES = ["Fastball","2-Seam Fastball","Cutter","Slider","Curveball","Changeup","Splitter","Knuckleball"];
