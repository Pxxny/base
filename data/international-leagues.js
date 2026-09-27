// ============================================================
// INTERNATIONAL PRO LEAGUES — 2026
// User-specified top-level leagues and clubs.
// ============================================================
const LMB_TEAMS = [
  { id: "MON", name: "Acereros de Monclova", city: "Monclova", stadium: "Acereros de Monclova Ballpark", league: "LMB", country: "Mexico" },
  { id: "ALG", name: "Algodoneros del Unión Laguna", city: "Torreón", stadium: "Algodoneros del Unión Laguna Ballpark", league: "LMB", country: "Mexico" },
  { id: "LEO", name: "Bravos de León", city: "León", stadium: "Bravos de León Ballpark", league: "LMB", country: "Mexico" },
  { id: "DUR", name: "Caliente de Durango", city: "Durango", stadium: "Caliente de Durango Ballpark", league: "LMB", country: "Mexico" },
  { id: "JAL", name: "Charros de Jalisco", city: "Zapopan", stadium: "Charros de Jalisco Ballpark", league: "LMB", country: "Mexico" },
  { id: "QRO", name: "Conspiradores de Querétaro", city: "Querétaro", stadium: "Conspiradores de Querétaro Ballpark", league: "LMB", country: "Mexico" },
  { id: "MEX", name: "Diablos Rojos del México", city: "Mexico City", stadium: "Diablos Rojos del México Ballpark", league: "LMB", country: "Mexico" },
  { id: "CHI", name: "Dorados de Chihuahua", city: "Chihuahua", stadium: "Dorados de Chihuahua Ballpark", league: "LMB", country: "Mexico" },
  { id: "VER", name: "El Águila de Veracruz", city: "Veracruz", stadium: "El Águila de Veracruz Ballpark", league: "LMB", country: "Mexico" },
  { id: "OAX", name: "Guerreros de Oaxaca", city: "Oaxaca", stadium: "Guerreros de Oaxaca Ballpark", league: "LMB", country: "Mexico" },
  { id: "YUC", name: "Leones de Yucatán", city: "Mérida", stadium: "Leones de Yucatán Ballpark", league: "LMB", country: "Mexico" },
  { id: "TAB", name: "Olmecas de Tabasco", city: "Villahermosa", stadium: "Olmecas de Tabasco Ballpark", league: "LMB", country: "Mexico" },
  { id: "PUE", name: "Pericos de Puebla", city: "Puebla", stadium: "Pericos de Puebla Ballpark", league: "LMB", country: "Mexico" },
  { id: "CAM", name: "Piratas de Campeche", city: "Campeche", stadium: "Piratas de Campeche Ballpark", league: "LMB", country: "Mexico" },
  { id: "AGS", name: "Rieleros de Aguascalientes", city: "Aguascalientes", stadium: "Rieleros de Aguascalientes Ballpark", league: "LMB", country: "Mexico" },
  { id: "SAL", name: "Saraperos de Saltillo", city: "Saltillo", stadium: "Saraperos de Saltillo Ballpark", league: "LMB", country: "Mexico" },
  { id: "MTY", name: "Sultanes de Monterrey", city: "Monterrey", stadium: "Sultanes de Monterrey Ballpark", league: "LMB", country: "Mexico" },
  { id: "LAR", name: "Tecos de los Dos Laredos", city: "Nuevo Laredo", stadium: "Tecos de los Dos Laredos Ballpark", league: "LMB", country: "Mexico" },
  { id: "QROO", name: "Tigres de Quintana Roo", city: "Cancún", stadium: "Tigres de Quintana Roo Ballpark", league: "LMB", country: "Mexico" },
  { id: "TIJ", name: "Toros de Tijuana", city: "Tijuana", stadium: "Toros de Tijuana Ballpark", league: "LMB", country: "Mexico" }
];

const LPB_TEAMS = [
  { id: "CAI", name: "Caimanes de Barranquilla", city: "Barranquilla", stadium: "Caimanes de Barranquilla Ballpark", league: "LPB", country: "Colombia" },
  { id: "SIN", name: "Toros de Sincelejo", city: "Sincelejo", stadium: "Toros de Sincelejo Ballpark", league: "LPB", country: "Colombia" },
  { id: "VAM", name: "Vaqueros de Montería", city: "Montería", stadium: "Vaqueros de Montería Ballpark", league: "LPB", country: "Colombia" },
  { id: "TIGC", name: "Tigres de Cartagena", city: "Cartagena", stadium: "Tigres de Cartagena Ballpark", league: "LPB", country: "Colombia" }
];

const CPBL_TEAMS = [
  { id: "RKM", name: "Rakuten Monkeys", city: "Taoyuan", stadium: "Rakuten Monkeys Ballpark", league: "CPBL", country: "Taiwan" },
  { id: "UNI", name: "Uni-President 7-Eleven Lions", city: "Tainan", stadium: "Uni-President 7-Eleven Lions Ballpark", league: "CPBL", country: "Taiwan" },
  { id: "CTB", name: "CTBC Brothers", city: "Taichung", stadium: "CTBC Brothers Ballpark", league: "CPBL", country: "Taiwan" },
  { id: "WCD", name: "Wei Chuan Dragons", city: "Taipei", stadium: "Wei Chuan Dragons Ballpark", league: "CPBL", country: "Taiwan" },
  { id: "TSG", name: "TSG Hawks", city: "Kaohsiung", stadium: "TSG Hawks Ballpark", league: "CPBL", country: "Taiwan" },
  { id: "FUB", name: "Fubon Guardians", city: "New Taipei", stadium: "Fubon Guardians Ballpark", league: "CPBL", country: "Taiwan" }
];

const LBPRC_TEAMS = [
  { id: "MAY", name: "Indios de Mayagüez", city: "Mayagüez", stadium: "Indios de Mayagüez Ballpark", league: "LBPRC", country: "Puerto Rico" },
  { id: "SJU", name: "Senadores de San Juan", city: "San Juan", stadium: "Senadores de San Juan Ballpark", league: "LBPRC", country: "Puerto Rico" },
  { id: "CAG", name: "Criollos de Caguas", city: "Caguas", stadium: "Criollos de Caguas Ballpark", league: "LBPRC", country: "Puerto Rico" },
  { id: "PON", name: "Leones de Ponce", city: "Ponce", stadium: "Leones de Ponce Ballpark", league: "LBPRC", country: "Puerto Rico" },
  { id: "SAN", name: "Cangrejeros de Santurce", city: "San Juan", stadium: "Cangrejeros de Santurce Ballpark", league: "LBPRC", country: "Puerto Rico" },
  { id: "CAR", name: "Gigantes de Carolina", city: "Carolina", stadium: "Gigantes de Carolina Ballpark", league: "LBPRC", country: "Puerto Rico" }
];

const CPB_TEAMS = [
  { id: "BJD", name: "Beijing CEDA Dragons", city: "Beijing", stadium: "Beijing CEDA Dragons Ballpark", league: "CPB", country: "China" },
  { id: "SHW", name: "Shanghai Whales", city: "Shanghai", stadium: "Shanghai Whales Ballpark", league: "CPB", country: "China" },
  { id: "XMD", name: "Xiamen Dolphins", city: "Xiamen", stadium: "Xiamen Dolphins Ballpark", league: "CPB", country: "China" },
  { id: "FZH", name: "Fuzhou Sea Heroes", city: "Fuzhou", stadium: "Fuzhou Sea Heroes Ballpark", league: "CPB", country: "China" },
  { id: "SZB", name: "Shenzhen Blue Sox", city: "Shenzhen", stadium: "Shenzhen Blue Sox Ballpark", league: "CPB", country: "China" },
  { id: "CSW", name: "Changsha Want Want Baseball Club", city: "Changsha", stadium: "Changsha Want Want Baseball Club Ballpark", league: "CPB", country: "China" }
];

const DBL_TEAMS = [
  { id: "HEI", name: "Heidenheim Heideköpfe", city: "Heidenheim", stadium: "Heidenheim Heideköpfe Ballpark", league: "DBL", division: "South", country: "Germany" },
  { id: "STR", name: "Stuttgart Reds", city: "Stuttgart", stadium: "Stuttgart Reds Ballpark", league: "DBL", division: "South", country: "Germany" },
  { id: "REG", name: "Guggenberger Legionäre Regensburg", city: "Regensburg", stadium: "Guggenberger Legionäre Regensburg Ballpark", league: "DBL", division: "South", country: "Germany" },
  { id: "GAU", name: "Gauting Indians", city: "Gauting", stadium: "Gauting Indians Ballpark", league: "DBL", division: "South", country: "Germany" },
  { id: "MAI", name: "Mainz Athletics", city: "Mainz", stadium: "Mainz Athletics Ballpark", league: "DBL", division: "South", country: "Germany" },
  { id: "MHD", name: "München-Haar Disciples", city: "Haar", stadium: "München-Haar Disciples Ballpark", league: "DBL", division: "South", country: "Germany" },
  { id: "HUN", name: "Hünstetten Storm", city: "Hünstetten", stadium: "Hünstetten Storm Ballpark", league: "DBL", division: "North", country: "Germany" },
  { id: "BON", name: "Bonn Capitals", city: "Bonn", stadium: "Bonn Capitals Ballpark", league: "DBL", division: "North", country: "Germany" },
  { id: "PAD", name: "Untouchables Paderborn", city: "Paderborn", stadium: "Untouchables Paderborn Ballpark", league: "DBL", division: "North", country: "Germany" },
  { id: "COL", name: "Cologne Cardinals", city: "Cologne", stadium: "Cologne Cardinals Ballpark", league: "DBL", division: "North", country: "Germany" },
  { id: "HAM", name: "Hamburg Stealers", city: "Hamburg", stadium: "Hamburg Stealers Ballpark", league: "DBL", division: "North", country: "Germany" },
  { id: "DOR", name: "Dortmund Wanderers", city: "Dortmund", stadium: "Dortmund Wanderers Ballpark", league: "DBL", division: "North", country: "Germany" }
];

const NBL_TEAMS = [
  { id: "LON", name: "London Mets", city: "London", stadium: "London Mets Ballpark", league: "NBL", division: "South", country: "United Kingdom" },
  { id: "CRO", name: "Croydon Pirates", city: "Croydon", stadium: "Croydon Pirates Ballpark", league: "NBL", division: "South", country: "United Kingdom" },
  { id: "ESS", name: "Essex Arrows", city: "Essex", stadium: "Essex Arrows Ballpark", league: "NBL", division: "South", country: "United Kingdom" },
  { id: "HET", name: "Herts Toucans", city: "Hertfordshire", stadium: "Herts Toucans Ballpark", league: "NBL", division: "South", country: "United Kingdom" },
  { id: "SHB", name: "Sheffield Bruins", city: "Sheffield", stadium: "Sheffield Bruins Ballpark", league: "NBL", division: "North", country: "United Kingdom" },
  { id: "LEI", name: "Leicester Blue Sox", city: "Leicester", stadium: "Leicester Blue Sox Ballpark", league: "NBL", division: "North", country: "United Kingdom" },
  { id: "LIV", name: "Liverpool Trojans", city: "Liverpool", stadium: "Liverpool Trojans Ballpark", league: "NBL", division: "North", country: "United Kingdom" },
  { id: "MAN", name: "Manchester A’s", city: "Manchester", stadium: "Manchester A’s Ballpark", league: "NBL", division: "North", country: "United Kingdom" },
  { id: "LON2", name: "Long Eaton Storm", city: "Long Eaton", stadium: "Long Eaton Storm Ballpark", league: "NBL", division: "North", country: "United Kingdom" }
];


const ABL_TEAMS = [
  { id: "ADG", name: "Adelaide Giants", city: "Adelaide", stadium: "Adelaide Giants Ballpark", league: "ABL", country: "Australia" },
  { id: "BRB", name: "Brisbane Bandits", city: "Brisbane", stadium: "Brisbane Bandits Ballpark", league: "ABL", country: "Australia" },
  { id: "CAC", name: "Canberra Cavalry", city: "Canberra", stadium: "Canberra Cavalry Ballpark", league: "ABL", country: "Australia" },
  { id: "MEA", name: "Melbourne Aces", city: "Melbourne", stadium: "Melbourne Aces Ballpark", league: "ABL", country: "Australia" },
  { id: "PEH", name: "Perth Heat", city: "Perth", stadium: "Perth Heat Ballpark", league: "ABL", country: "Australia" },
  { id: "SBS", name: "Sydney Blue Sox", city: "Sydney", stadium: "Sydney Blue Sox Ballpark", league: "ABL", country: "Australia" }
];

const ITA_TEAMS = [
  { id: "PARB", name: "Parma Baseball", city: "Parma", stadium: "Parma Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "SMB", name: "San Marino Baseball", city: "San Marino", stadium: "San Marino Baseball Ballpark", league: "SAB", country: "San Marino" },
  { id: "UBO", name: "Unipol Bologna", city: "Bologna", stadium: "Unipol Bologna Ballpark", league: "SAB", country: "Italy" },
  { id: "NET", name: "Nettuno 1945", city: "Nettuno", stadium: "Nettuno 1945 Ballpark", league: "SAB", country: "Italy" },
  { id: "MAC", name: "Macerata Baseball", city: "Macerata", stadium: "Macerata Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "GRO", name: "Grosseto Baseball", city: "Grosseto", stadium: "Grosseto Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "SGB", name: "San Giacomo Baseball", city: "San Giacomo", stadium: "San Giacomo Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "BGC", name: "BSC Grosseto", city: "Grosseto", stadium: "BSC Grosseto Ballpark", league: "SAB", country: "Italy" },
  { id: "BBG", name: "BBC Grosseto", city: "Grosseto", stadium: "BBC Grosseto Ballpark", league: "SAB", country: "Italy" },
  { id: "PCL", name: "Parma Clima", city: "Parma", stadium: "Parma Clima Ballpark", league: "SAB", country: "Italy" },
  { id: "FBO", name: "Fortitudo Bologna", city: "Bologna", stadium: "Fortitudo Bologna Ballpark", league: "SAB", country: "Italy" },
  { id: "GOD", name: "Godo Baseball", city: "Godo", stadium: "Godo Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "SEN", name: "Senago Baseball", city: "Senago", stadium: "Senago Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "MIL", name: "Milano Baseball", city: "Milano", stadium: "Milano Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "RDL", name: "Ronchi dei Legionari", city: "Ronchi dei Legionari", stadium: "Ronchi dei Legionari Ballpark", league: "SAB", country: "Italy" },
  { id: "CTV", name: "Castelfranco Veneto", city: "Castelfranco Veneto", stadium: "Castelfranco Veneto Ballpark", league: "SAB", country: "Italy" },
  { id: "PAD2", name: "Padova Baseball", city: "Padova", stadium: "Padova Baseball Ballpark", league: "SAB", country: "Italy" },
  { id: "VER2", name: "Verona Baseball", city: "Verona", stadium: "Verona Baseball Ballpark", league: "SAB", country: "Italy" }
];

const HOOFDKLASSE_TEAMS = [
  { id: "AMP", name: "Amsterdam Pirates", city: "Amsterdam", stadium: "Amsterdam Pirates Ballpark", league: "HHK", country: "Netherlands" },
  { id: "HCA", name: "HCAW", city: "Bussum", stadium: "HCAW Ballpark", league: "HHK", country: "Netherlands" },
  { id: "NEP", name: "Neptunus", city: "Rotterdam", stadium: "Neptunus Ballpark", league: "HHK", country: "Netherlands" },
  { id: "CNE", name: "Curaçao Neptunus", city: "Rotterdam", stadium: "Curaçao Neptunus Ballpark", league: "HHK", country: "Netherlands" },
  { id: "HOP", name: "Hoofddorp Pioniers", city: "Hoofddorp", stadium: "Hoofddorp Pioniers Ballpark", league: "HHK", country: "Netherlands" },
  { id: "RCH", name: "RCH-Pinguïns", city: "Heemstede", stadium: "RCH-Pinguïns Ballpark", league: "HHK", country: "Netherlands" },
  { id: "DSS", name: "DSS/Kinheim", city: "Haarlem", stadium: "DSS/Kinheim Ballpark", league: "HHK", country: "Netherlands" },
  { id: "QAM", name: "Quick Amersfoort", city: "Amersfoort", stadium: "Quick Amersfoort Ballpark", league: "HHK", country: "Netherlands" }
];

const CUBA_TEAMS = [
  { id: "INDC", name: "Industriales", city: "Havana", stadium: "Industriales Ballpark", league: "SNB", country: "Cuba" },
  { id: "PIN", name: "Pinar del Río", city: "Pinar del Río", stadium: "Pinar del Río Ballpark", league: "SNB", country: "Cuba" },
  { id: "ART", name: "Artemisa", city: "Artemisa", stadium: "Artemisa Ballpark", league: "SNB", country: "Cuba" },
  { id: "MAYC", name: "Mayabeque", city: "Mayabeque", stadium: "Mayabeque Ballpark", league: "SNB", country: "Cuba" },
  { id: "IDJ", name: "Isla de la Juventud", city: "Isla de la Juventud", stadium: "Isla de la Juventud Ballpark", league: "SNB", country: "Cuba" },
  { id: "MAT", name: "Matanzas", city: "Matanzas", stadium: "Matanzas Ballpark", league: "SNB", country: "Cuba" },
  { id: "CIE", name: "Cienfuegos", city: "Cienfuegos", stadium: "Cienfuegos Ballpark", league: "SNB", country: "Cuba" },
  { id: "VIL", name: "Villa Clara", city: "Santa Clara", stadium: "Villa Clara Ballpark", league: "SNB", country: "Cuba" },
  { id: "SSP", name: "Sancti Spíritus", city: "Sancti Spíritus", stadium: "Sancti Spíritus Ballpark", league: "SNB", country: "Cuba" },
  { id: "CAV", name: "Ciego de Ávila", city: "Ciego de Ávila", stadium: "Ciego de Ávila Ballpark", league: "SNB", country: "Cuba" },
  { id: "CAMC", name: "Camagüey", city: "Camagüey", stadium: "Camagüey Ballpark", league: "SNB", country: "Cuba" },
  { id: "LTU", name: "Las Tunas", city: "Las Tunas", stadium: "Las Tunas Ballpark", league: "SNB", country: "Cuba" },
  { id: "GRA", name: "Granma", city: "Bayamo", stadium: "Granma Ballpark", league: "SNB", country: "Cuba" },
  { id: "HOL", name: "Holguín", city: "Holguín", stadium: "Holguín Ballpark", league: "SNB", country: "Cuba" },
  { id: "SCU", name: "Santiago de Cuba", city: "Santiago de Cuba", stadium: "Santiago de Cuba Ballpark", league: "SNB", country: "Cuba" },
  { id: "GUA", name: "Guantánamo", city: "Guantánamo", stadium: "Guantánamo Ballpark", league: "SNB", country: "Cuba" }
];

const ADDITIONAL_GLOBAL_TEAMS = [...ABL_TEAMS, ...ITA_TEAMS, ...HOOFDKLASSE_TEAMS, ...CUBA_TEAMS];
