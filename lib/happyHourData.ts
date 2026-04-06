export type HappyHourVenue = {
  name: string;
  address: string;
  type: ('bar' | 'restaurant' | 'club' | 'fitness')[];
  lat: number;
  lng: number;
  deals: { days: number[]; start: string; end: string; description: string; description_fr: string }[];
  // Foursquare enrichment (populated by scripts/enrich-venues.js)
  fsqId?: string;
  rating?: number;
  photoUrl?: string;
  lastVerified?: string;
};

export const HAPPY_HOUR_VENUES: HappyHourVenue[] = [
  { name: "Joey's Lansdowne", address: '825 Exhibition Way', type: ['bar', 'restaurant'], lat: 45.3998, lng: -75.6844, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Happy Hour daily 3-6pm', description_fr: '5 \u00e0 7 tous les jours 15h-18h' },
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm-close specials', description_fr: 'Sp\u00e9ciaux dim-jeu 21h-fermeture' },
    { days: [2], start: '15:00', end: '23:59', description: 'Up to 50% off wine Tuesdays', description_fr: "Jusqu'\u00e0 50% de rabais sur le vin le mardi" },
  ], fsqId: '552aafb8498e5d11808ced72'},
  { name: "Joey's Rideau", address: '50 Rideau St', type: ['bar', 'restaurant'], lat: 45.4260, lng: -75.6916, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Happy Hour daily 3-6pm', description_fr: '5 \u00e0 7 tous les jours 15h-18h' },
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm-close specials', description_fr: 'Sp\u00e9ciaux dim-jeu 21h-fermeture' },
    { days: [2], start: '15:00', end: '23:59', description: 'Up to 50% off wine Tuesdays', description_fr: "Jusqu'\u00e0 50% de rabais sur le vin le mardi" },
  ], fsqId: '59372e23f1fdaf456f0c9409'},
  { name: 'Local Public Eatery', address: '825 Exhibition Way', type: ['bar', 'restaurant'], lat: 45.3999, lng: -75.6840, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm happy hour', description_fr: '5 \u00e0 7 lun-ven 14h-17h' },
    { days: [6], start: '10:00', end: '14:00', description: 'Sat drinks only 10am-2pm', description_fr: 'Sam boissons seulement 10h-14h' },
    { days: [0,1,2], start: '21:00', end: '23:59', description: 'Sun-Wed 9pm-close specials', description_fr: 'Sp\u00e9ciaux dim-mer 21h-fermeture' },
    { days: [3,4,5,6], start: '22:00', end: '23:59', description: 'Thu-Sat 10pm-close specials', description_fr: 'Sp\u00e9ciaux jeu-sam 22h-fermeture' },
  ], fsqId: '59414511cf72a05e597432b2'},
  { name: 'Pour Boy', address: '495 Somerset St W', type: ['bar', 'restaurant'], lat: 45.4138, lng: -75.7005, deals: [
    { days: [1], start: '11:00', end: '23:59', description: '25% off wings Monday', description_fr: '25% de rabais sur les ailes le lundi' },
    { days: [2], start: '19:00', end: '23:59', description: 'Trivia night Tuesday', description_fr: 'Soir\u00e9e quiz le mardi' },
    { days: [3], start: '19:00', end: '23:59', description: 'Open Mic Wednesday', description_fr: 'Micro ouvert le mercredi' },
    { days: [4], start: '19:00', end: '23:59', description: 'Comedy night Thursday', description_fr: "Soir\u00e9e d'humour le jeudi" },
    { days: [5], start: '11:00', end: '23:59', description: '25% off fish & chips + Blingo Friday', description_fr: '25% de rabais fish & chips + Blingo le vendredi' },
  ], fsqId: '5190118c498e91f3c397aacd'},
  { name: 'Rabbit Hole', address: '208 Sparks St', type: ['bar', 'restaurant', 'club'], lat: 45.4212, lng: -75.7010, deals: [
    { days: [2], start: '16:00', end: '18:00', description: 'Tue HH 4-6pm', description_fr: 'Mar 5 \u00e0 7 16h-18h' },
    { days: [2], start: '17:00', end: '23:59', description: 'Half off wine + half off pizzas 5pm-late Tue', description_fr: 'Moiti\u00e9 prix vin + pizzas 17h-tard mar' },
    { days: [3], start: '16:00', end: '18:00', description: 'Wed HH 4-6pm + half price oysters', description_fr: 'Mer 5 \u00e0 7 16h-18h + hu\u00eetres moiti\u00e9 prix' },
    { days: [4], start: '16:00', end: '18:00', description: 'Thu HH 4-6pm', description_fr: 'Jeu 5 \u00e0 7 16h-18h' },
    { days: [5,6], start: '21:00', end: '23:59', description: 'Fri/Sat Live DJ', description_fr: 'Ven/Sam DJ en direct' },
  ], fsqId: '5c09953c1af852002c198160'},
  { name: 'Whalesbone', address: '430 Bank St', type: ['restaurant', 'bar'], lat: 45.4122, lng: -75.6939, deals: [
    { days: [0], start: '17:00', end: '23:59', description: 'Oysters ~$2 each Sunday nights', description_fr: 'Hu\u00eetres ~2$ chacune le dimanche soir' },
  ], fsqId: '4b789c4cf964a5200eda2ee3'},
  { name: "Lieutenant's Pump", address: '361 Elgin St', type: ['restaurant', 'bar', 'club'], lat: 45.4153, lng: -75.6878, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wednesday wing day - half price', description_fr: 'Mercredi journ\u00e9e ailes - moiti\u00e9 prix' },
    { days: [1,2,3,4,5], start: '11:00', end: '14:00', description: 'Lunch combo: pint + supper $5', description_fr: 'Combo d\u00eener : pinte + repas 5$' },
  ], fsqId: '4b0586def964a520597222e3'},
  { name: 'The Standard', address: '360 Elgin St', type: ['restaurant', 'bar', 'club'], lat: 45.4153, lng: -75.6884, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Happy Hour 7 days a week 5-7pm', description_fr: '5 \u00e0 7 tous les jours 17h-19h' },
  ], fsqId: '4b073355f964a52079f922e3'},
  { name: 'Heart and Crown ByWard', address: '67 Clarence St', type: ['restaurant', 'bar', 'club'], lat: 45.4290, lng: -75.6935, deals: [
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: $5 house draught', description_fr: 'Lun : pression maison 5$' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: half price wine', description_fr: 'Mar : vin moiti\u00e9 prix' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: $5 rail cocktails', description_fr: 'Mer : cocktails maison 5$' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $5 quarts and craft cans', description_fr: 'Jeu : quarts et canettes artisanales 5$' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $6 bloody caesars', description_fr: 'Dim : bloody caesars 6$' },
  ], fsqId: '4ad8ec60f964a5200c1621e3'},
  { name: 'Heart and Crown Preston', address: '361 Preston St', type: ['restaurant', 'bar', 'club'], lat: 45.4011, lng: -75.7096, deals: [
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: $5 house draught', description_fr: 'Lun : pression maison 5$' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: half price wine', description_fr: 'Mar : vin moiti\u00e9 prix' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: $5 rail cocktails', description_fr: 'Mer : cocktails maison 5$' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $5 quarts and craft cans', description_fr: 'Jeu : quarts et canettes artisanales 5$' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $6 bloody caesars', description_fr: 'Dim : bloody caesars 6$' },
  ], fsqId: '4b3cc0baf964a520d48625e3'},
  { name: 'Union Local 613', address: '315 Somerset St W', type: ['restaurant', 'bar'], lat: 45.4161, lng: -75.6949, deals: [
    { days: [1,2,3,4,5], start: '16:00', end: '17:00', description: 'Mon-Fri 4-5pm: half price wine, $6 draft, cheap cocktails', description_fr: 'Lun-ven 16h-17h : vin moiti\u00e9 prix, pression 6$, cocktails \u00e0 rabais' },
  ], fsqId: '5005ecd7e4b0645daf340728'},
  { name: 'Senate Bank', address: '259 Bank St', type: ['restaurant', 'bar'], lat: 45.4162, lng: -75.6968, deals: [
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $15 wings 5pm+, $7 lagers + $5 Jameson late', description_fr: 'Lun : ailes 15$ d\u00e8s 17h, lagers 7$ + Jameson 5$ en soir\u00e9e' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $5 tequila + $12 margs all day', description_fr: 'Mar : tequila 5$ + margaritas 12$ toute la journ\u00e9e' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: AYCE wings $28 + $15 mini pitcher', description_fr: 'Jeu : ailes \u00e0 volont\u00e9 28$ + mini pichet 15$' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $15 fish & chips, $5 tequila + $12 margs', description_fr: 'Ven : fish & chips 15$, tequila 5$ + margaritas 12$' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $30 bottle of wine', description_fr: 'Sam : bouteille de vin 30$' },
    { days: [0], start: '14:00', end: '17:00', description: 'Sun: $5 caesars, double HH 2-5pm', description_fr: 'Dim : caesars 5$, double 5 \u00e0 7 14h-17h' },
    { days: [0], start: '23:00', end: '23:59', description: 'Sun: double HH 11pm-2am', description_fr: 'Dim : double 5 \u00e0 7 23h-2h' },
  ]},
  { name: 'Senate Clarence', address: '83 Clarence St', type: ['restaurant', 'bar'], lat: 45.4293, lng: -75.6931, deals: [
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $15 wings 5pm+, $7 lagers + $5 Jameson late', description_fr: 'Lun : ailes 15$ d\u00e8s 17h, lagers 7$ + Jameson 5$ en soir\u00e9e' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $5 tequila + $12 margs all day', description_fr: 'Mar : tequila 5$ + margaritas 12$ toute la journ\u00e9e' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: AYCE wings $28 + $15 mini pitcher', description_fr: 'Jeu : ailes \u00e0 volont\u00e9 28$ + mini pichet 15$' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $15 fish & chips, $5 tequila + $12 margs', description_fr: 'Ven : fish & chips 15$, tequila 5$ + margaritas 12$' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $30 bottle of wine', description_fr: 'Sam : bouteille de vin 30$' },
    { days: [0], start: '14:00', end: '17:00', description: 'Sun: $5 caesars, double HH 2-5pm', description_fr: 'Dim : caesars 5$, double 5 \u00e0 7 14h-17h' },
    { days: [0], start: '23:00', end: '23:59', description: 'Sun: double HH 11pm-2am', description_fr: 'Dim : double 5 \u00e0 7 23h-2h' },
  ], fsqId: '50aed23ae4b0d8a9ef9dcd04'},
  { name: 'Senate Wellington', address: '93 Wellington St', type: ['restaurant', 'bar'], lat: 45.4233, lng: -75.6987, deals: [
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $15 wings 5pm+, $7 lagers + $5 Jameson late', description_fr: 'Lun : ailes 15$ d\u00e8s 17h, lagers 7$ + Jameson 5$ en soir\u00e9e' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $5 tequila + $12 margs all day', description_fr: 'Mar : tequila 5$ + margaritas 12$ toute la journ\u00e9e' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: AYCE wings $28 + $15 mini pitcher', description_fr: 'Jeu : ailes \u00e0 volont\u00e9 28$ + mini pichet 15$' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $15 fish & chips, $5 tequila + $12 margs', description_fr: 'Ven : fish & chips 15$, tequila 5$ + margaritas 12$' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $30 bottle of wine', description_fr: 'Sam : bouteille de vin 30$' },
    { days: [0], start: '14:00', end: '17:00', description: 'Sun: $5 caesars, double HH 2-5pm', description_fr: 'Dim : caesars 5$, double 5 \u00e0 7 14h-17h' },
    { days: [0], start: '23:00', end: '23:59', description: 'Sun: double HH 11pm-2am', description_fr: 'Dim : double 5 \u00e0 7 23h-2h' },
  ]},
  { name: 'Barley Mow Merivale', address: '1541 Merivale Rd', type: ['restaurant', 'bar'], lat: 45.3555, lng: -75.7352, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm HH', description_fr: 'Lun-ven 5 \u00e0 7 14h-17h' },
    { days: [3], start: '20:00', end: '23:59', description: 'Wed 8pm: 30c wings', description_fr: 'Mer 20h : ailes \u00e0 30\u00a2' },
    { days: [4], start: '20:00', end: '23:59', description: 'Thu 8pm: Thirsty Thursdays', description_fr: 'Jeu 20h : les jeudis assoiff\u00e9s' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $27 special + $9 beer flights', description_fr: 'Lun : sp\u00e9cial 27$ + d\u00e9gustation de bi\u00e8res 9$' },
    { days: [2], start: '17:00', end: '23:59', description: 'Tue: $27 tacos + $10 margaritas', description_fr: 'Mar : tacos 27$ + margaritas 10$' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: $27 sandwich + $30 wine bottles', description_fr: 'Mer : sandwich 27$ + bouteilles de vin 30$' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: $27 burger', description_fr: 'Jeu : burger 27$' },
    { days: [5], start: '17:00', end: '23:59', description: 'Fri: $27 fish & chips + $36.95 prime rib', description_fr: 'Ven : fish & chips 27$ + c\u00f4te de b\u0153uf 36,95$' },
    { days: [6,0], start: '11:00', end: '23:59', description: 'Sat/Sun: $7.50 caesars. Sun: kids eat free', description_fr: 'Sam/dim : caesars 7,50$. Dim : enfants mangent gratuit' },
  ], fsqId: '5827c286089b755fe52f6954'},
  { name: 'Barley Mow Westboro', address: '399 Richmond Rd', type: ['restaurant', 'bar'], lat: 45.3910, lng: -75.7566, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm HH', description_fr: 'Lun-ven 5 \u00e0 7 14h-17h' },
    { days: [3], start: '20:00', end: '23:59', description: 'Wed 8pm: 30c wings', description_fr: 'Mer 20h : ailes \u00e0 30\u00a2' },
    { days: [4], start: '20:00', end: '23:59', description: 'Thu 8pm: Thirsty Thursdays', description_fr: 'Jeu 20h : les jeudis assoiff\u00e9s' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $27 special + $9 beer flights', description_fr: 'Lun : sp\u00e9cial 27$ + d\u00e9gustation de bi\u00e8res 9$' },
    { days: [2], start: '17:00', end: '23:59', description: 'Tue: $27 tacos + $10 margaritas', description_fr: 'Mar : tacos 27$ + margaritas 10$' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: $27 sandwich + $30 wine bottles', description_fr: 'Mer : sandwich 27$ + bouteilles de vin 30$' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: $27 burger', description_fr: 'Jeu : burger 27$' },
    { days: [5], start: '17:00', end: '23:59', description: 'Fri: $27 fish & chips + $36.95 prime rib', description_fr: 'Ven : fish & chips 27$ + c\u00f4te de b\u0153uf 36,95$' },
    { days: [6,0], start: '11:00', end: '23:59', description: 'Sat/Sun: $7.50 caesars. Sun: kids eat free', description_fr: 'Sam/dim : caesars 7,50$. Dim : enfants mangent gratuit' },
  ], fsqId: '54ac7e16498ef7a42cd42c0b'},
  { name: 'Royal Oak Wellington', address: '1217 Wellington St W', type: ['restaurant', 'bar'], lat: 45.4002, lng: -75.7313, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps', description_fr: 'Dim-jeu 21h : domestiques/vin/maison 5,50$ + apps moiti\u00e9 prix' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm', description_fr: 'Lun : 50% de rabais sur les ailes apr\u00e8s 17h' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm', description_fr: 'Mer : 50% ailes apr\u00e8s 17h + quiz 19h' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles', description_fr: 'Jeu : 50% de rabais sur les bouteilles de vin' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips', description_fr: 'Ven : 3$ de rabais sur le fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails', description_fr: 'Sam : cocktails maison 5,95$' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts', description_fr: 'Dim : caesars + pressions artisanales 7,95$' },
  ], fsqId: '4b08418df964a5207f0723e3'},
  { name: 'Royal Oak Bank', address: '188 Bank St', type: ['restaurant', 'bar'], lat: 45.4178, lng: -75.6986, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps', description_fr: 'Dim-jeu 21h : domestiques/vin/maison 5,50$ + apps moiti\u00e9 prix' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm', description_fr: 'Lun : 50% de rabais sur les ailes apr\u00e8s 17h' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm', description_fr: 'Mer : 50% ailes apr\u00e8s 17h + quiz 19h' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles', description_fr: 'Jeu : 50% de rabais sur les bouteilles de vin' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips', description_fr: 'Ven : 3$ de rabais sur le fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails', description_fr: 'Sam : cocktails maison 5,95$' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts', description_fr: 'Dim : caesars + pressions artisanales 7,95$' },
  ], fsqId: '4b1b1169f964a52086f723e3'},
  { name: 'Royal Oak Slater', address: '180 Kent St', type: ['restaurant', 'bar'], lat: 45.4180, lng: -75.7017, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps', description_fr: 'Dim-jeu 21h : domestiques/vin/maison 5,50$ + apps moiti\u00e9 prix' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm', description_fr: 'Lun : 50% de rabais sur les ailes apr\u00e8s 17h' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm', description_fr: 'Mer : 50% ailes apr\u00e8s 17h + quiz 19h' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles', description_fr: 'Jeu : 50% de rabais sur les bouteilles de vin' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips', description_fr: 'Ven : 3$ de rabais sur le fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails', description_fr: 'Sam : cocktails maison 5,95$' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts', description_fr: 'Dim : caesars + pressions artisanales 7,95$' },
  ], fsqId: '4bc0acccabf49521769cbf93'},
  { name: "Jack Astor's Lansdowne", address: '425 Marche Way', type: ['restaurant', 'bar'], lat: 45.4008, lng: -75.6830, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm', description_fr: '5 \u00e0 7 tous les jours 14h-17h' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials', description_fr: 'Sp\u00e9ciaux 21h-fermeture' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue', description_fr: 'Bouteilles de vin moiti\u00e9 prix lun et mar' },
  ], fsqId: '551ecc37498e282ec09386bc'},
  { name: "Jack Astor's Hunt Club", address: '310 W Hunt Club Rd', type: ['restaurant', 'bar'], lat: 45.3391, lng: -75.7129, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm', description_fr: '5 \u00e0 7 tous les jours 14h-17h' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials', description_fr: 'Sp\u00e9ciaux 21h-fermeture' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue', description_fr: 'Bouteilles de vin moiti\u00e9 prix lun et mar' },
  ]},
  { name: "Jack Astor's Kanata", address: '125 Roland Michener Dr', type: ['restaurant', 'bar'], lat: 45.3085, lng: -75.9131, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm', description_fr: '5 \u00e0 7 tous les jours 14h-17h' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials', description_fr: 'Sp\u00e9ciaux 21h-fermeture' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue', description_fr: 'Bouteilles de vin moiti\u00e9 prix lun et mar' },
  ], fsqId: '4b67496cf964a520f1452be3'},
  { name: 'Shore Club', address: '11 Colonel By Dr', type: ['restaurant', 'bar'], lat: 45.4250, lng: -75.6927, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '17:00', description: 'Daily 3-5pm: half price oysters, $2 prawns, $3.50 sliders, $9 Heineken, $12 wine', description_fr: 'Tous les jours 15h-17h : hu\u00eetres moiti\u00e9 prix, crevettes 2$, sliders 3,50$, Heineken 9$, vin 12$' },
  ], fsqId: '4ca92d1997c8a1cdbfa58ca5'},
  { name: 'Drip House', address: '692 Somerset St W', type: ['bar'], lat: 45.4110, lng: -75.7065, deals: [
    { days: [3,4,5], start: '16:30', end: '18:30', description: 'Wed-Fri 4:30-6:30pm: $9 cocktails, wine, and appetizers', description_fr: 'Mer-ven 16h30-18h30 : cocktails, vin et entr\u00e9es 9$' },
  ], fsqId: '60f85ba01d6ca603569e8e81'},
  { name: 'Baton Rouge Downtown', address: '360 Albert St', type: ['restaurant', 'bar'], lat: 45.4181, lng: -75.7038, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails', description_fr: 'Lun-ven 15h-18h : pintes 7$, vin 7$, cocktails 10$' },
  ], fsqId: '4b197777f964a520d7dd23e3'},
  { name: 'Baton Rouge Hunt Club', address: '270 W Hunt Club Rd', type: ['restaurant', 'bar'], lat: 45.3396, lng: -75.7110, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails', description_fr: 'Lun-ven 15h-18h : pintes 7$, vin 7$, cocktails 10$' },
  ], fsqId: '566f3e6f498eded04dd25d78'},
  { name: 'Baton Rouge Kanata', address: '790 Earl Grey Dr', type: ['restaurant', 'bar'], lat: 45.3106, lng: -75.9095, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails', description_fr: 'Lun-ven 15h-18h : pintes 7$, vin 7$, cocktails 10$' },
  ], fsqId: '4b26a070f964a520937e24e3'},
  { name: 'Craft Beer Market', address: '975 Bank St', type: ['bar'], lat: 45.3987, lng: -75.6856, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm HH: discounted craft beer, wine, cocktails', description_fr: 'Tous les jours 14h-17h : bi\u00e8re artisanale, vin, cocktails \u00e0 rabais' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close HH', description_fr: '5 \u00e0 7 21h-fermeture' },
    { days: [0], start: '11:00', end: '23:59', description: 'All-day specials Sundays', description_fr: 'Sp\u00e9ciaux toute la journ\u00e9e le dimanche' },
  ], fsqId: '5721372438fa52a01938e14e'},
  { name: 'The Waverly', address: '339 Elgin St', type: ['bar', 'club'], lat: 45.4150, lng: -75.6880, deals: [
    { days: [5,6], start: '22:00', end: '23:30', description: 'Fri/Sat 10-11:30pm: $5 bar rail', description_fr: 'Ven/sam 22h-23h30 : cocktails maison 5$' },
  ], fsqId: '5555a299498ec38e4f69398d'},
  { name: 'House of TARG', address: '1077 Bank St', type: ['restaurant', 'bar', 'club'], lat: 45.3943, lng: -75.6832, deals: [
    { days: [2], start: '17:00', end: '23:00', description: 'Tue: $12.50 unlimited arcade 5-11pm', description_fr: 'Mar : arcade illimit\u00e9e 12,50$ 17h-23h' },
    { days: [0], start: '20:00', end: '23:59', description: 'Sun: Free-Play After Dark $12.50 8pm-12am', description_fr: 'Dim : jeu libre apr\u00e8s la tomb\u00e9e 12,50$ 20h-minuit' },
    { days: [3,4,5,6], start: '20:00', end: '23:59', description: 'Thu-Sat: live music from 8pm, $10-20 cover', description_fr: 'Jeu-sam : musique live d\u00e8s 20h, couvert 10-20$' },
  ], fsqId: '51df648834561cc46c3e6ce3'},
  { name: 'Level One Game Pub', address: '14 Waller St', type: ['restaurant', 'bar'], lat: 45.4262, lng: -75.6885, deals: [
    { days: [1], start: '18:30', end: '20:00', description: 'Mon: Geek Trivia 6:30-8pm, free w/ purchase', description_fr: 'Lun : quiz geek 18h30-20h, gratuit avec achat' },
    { days: [2], start: '17:30', end: '20:00', description: 'Tue: T.K.O. fight night 5:30-8pm, $6', description_fr: 'Mar : soir\u00e9e combat T.K.O. 17h30-20h, 6$' },
    { days: [4], start: '18:00', end: '23:00', description: 'Thu: Reddit board game meetup 6pm', description_fr: 'Jeu : rencontre jeux de soci\u00e9t\u00e9 Reddit 18h' },
    { days: [0], start: '17:00', end: '23:00', description: 'Sun: Magic: The Gathering 5pm, $6 w/ purchase', description_fr: 'Dim : Magic: The Gathering 17h, 6$ avec achat' },
  ], fsqId: '56e61689498e951537d3f9ed'},
  { name: 'Happy Fish', address: '330 Elgin St', type: ['bar', 'club'], lat: 45.4153, lng: -75.6882, deals: [
    { days: [4], start: '21:00', end: '23:59', description: 'Thu: $5 Jagerbombs + $5 draught 9pm-2am', description_fr: 'Jeu : Jagerbombs 5$ + pression 5$ 21h-2h' },
    { days: [5,6], start: '21:00', end: '23:59', description: 'Fri/Sat: open 9pm-2am', description_fr: 'Ven/sam : ouvert 21h-2h' },
  ], fsqId: '868f6fef88064d68e8563e15'},
  { name: 'Gridworks', address: '221 Rideau St', type: ['club'], lat: 45.4280, lng: -75.6890, deals: [
    { days: [4], start: '22:00', end: '23:59', description: 'Thu: Concepthursday night', description_fr: 'Jeu : soir\u00e9e Concepthursday' },
    { days: [5], start: '22:00', end: '23:59', description: 'Fri: weekly events (Signal, Intersection)', description_fr: 'Ven : \u00e9v\u00e9nements hebdo (Signal, Intersection)' },
    { days: [6], start: '22:00', end: '23:59', description: 'Sat: Off Grid night', description_fr: 'Sam : soir\u00e9e Off Grid' },
  ]},
  { name: 'City At Night', address: '222 Slater St', type: ['club'], lat: 45.4186, lng: -75.7002, deals: [
    { days: [5], start: '22:00', end: '23:59', description: 'Fri: weekly electronic events', description_fr: "Ven : \u00e9v\u00e9nements \u00e9lectroniques hebdo" },
    { days: [6], start: '22:00', end: '23:59', description: 'Sat: White Rabbit tech house', description_fr: 'Sam : White Rabbit tech house' },
  ], fsqId: '5834b21e13bb777f467bf1c5'},
  { name: 'Hintonburg Public House', address: '1020 Wellington St W', type: ['restaurant', 'bar'], lat: 45.3970, lng: -75.7270, deals: [
    { days: [0,1,2,3,4,5,6], start: '16:00', end: '18:00', description: 'Daily 4-6pm: Old Style Pils + bar mix $10', description_fr: 'Tous les jours 16h-18h : Old Style Pils + m\u00e9lange bar 10$' },
    { days: [1], start: '11:30', end: '23:59', description: 'Mon: 20% off main course w/ beverage', description_fr: 'Lun : 20% de rabais sur le plat principal avec boisson' },
    { days: [2], start: '16:00', end: '23:59', description: 'Tue: nacho night $18', description_fr: 'Mar : soir\u00e9e nachos 18$' },
    { days: [3], start: '16:00', end: '23:59', description: 'Wed: burger + beer + bar mix $30', description_fr: 'Mer : burger + bi\u00e8re + m\u00e9lange bar 30$' },
    { days: [4], start: '11:30', end: '23:59', description: 'Thu: 50% off kids mains', description_fr: 'Jeu : 50% de rabais sur les plats enfants' },
    { days: [5], start: '11:30', end: '18:00', description: 'Fri: fish & chips + $8 draft 11:30am-6pm', description_fr: 'Ven : fish & chips + pression 8$ 11h30-18h' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $8 craft drafts + $5 Jameson (service industry)', description_fr: "Dim : pressions artisanales 8$ + Jameson 5$ (industrie de l'hospitalit\u00e9)" },
  ]},
  { name: 'Prohibition Public House', address: '337 Somerset St W', type: ['restaurant', 'bar'], lat: 45.4159, lng: -75.6948, deals: [
    { days: [1,2,3,4,5], start: '17:00', end: '18:00', description: 'Mon-Fri 5-6pm: $12 margs, $10 sangria, $6 wine/pilsner, 40% off apps', description_fr: 'Lun-ven 17h-18h : margaritas 12$, sangria 10$, vin/pilsner 6$, 40% entr\u00e9es' },
  ], fsqId: '5764825e498e720858e533cf'},
  { name: 'Apothecary Lounge', address: '54 York St', type: ['restaurant', 'bar'], lat: 45.4280, lng: -75.6940, deals: [
    { days: [0,1,2,3,4], start: '22:00', end: '23:59', description: 'Sun-Thu 10pm-midnight: half price martinis, wine, First Light draft', description_fr: 'Dim-jeu 22h-minuit : martinis, vin, First Light moiti\u00e9 prix' },
  ], fsqId: '60e1f5740e501b1ba8b0ce39'},
  { name: 'ALORA Ottawa', address: '34 Clarence St', type: ['restaurant', 'bar'], lat: 45.4290, lng: -75.6937, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Daily 5-7pm happy hour', description_fr: '5 \u00e0 7 tous les jours 17h-19h' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wine bottles', description_fr: 'Mer : bouteilles de vin moiti\u00e9 prix' },
  ], fsqId: '653c4394a627d9780286fe61'},
  { name: '10Fourteen', address: '1014 Wellington St W', type: ['restaurant', 'bar'], lat: 45.3971, lng: -75.7265, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Daily 5-7pm: $8 wine, $6 draft, 20% off charcuterie', description_fr: 'Tous les jours 17h-19h : vin 8$, pression 6$, 20% charcuterie' },
    { days: [5], start: '21:00', end: '23:59', description: 'Fri: DJ night from 9pm', description_fr: 'Ven : soir\u00e9e DJ d\u00e8s 21h' },
  ]},
  { name: 'The Gilmour', address: '313 Bank St', type: ['restaurant', 'bar'], lat: 45.4165, lng: -75.6966, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Daily 3-6pm: happy hour beer, wine, fries', description_fr: 'Tous les jours 15h-18h : 5 \u00e0 7 bi\u00e8re, vin, frites' },
  ], fsqId: '62e6a8440dd547639eb1f3f1'},
  { name: "Grey's Social Eatery", address: '2 Byward Market Square', type: ['restaurant', 'bar'], lat: 45.4274, lng: -75.6930, deals: [
    { days: [0,1,2,3,4,5,6], start: '16:00', end: '18:00', description: 'Daily 4-6pm: $6 highballs/draught/wine + app specials', description_fr: 'Tous les jours 16h-18h : highballs/pression/vin 6$ + sp\u00e9ciaux entr\u00e9es' },
    { days: [0,1,2,3,4,5,6], start: '22:00', end: '23:59', description: 'Daily 10pm-late: $6 highballs/draught/wine', description_fr: 'Tous les jours 22h-tard : highballs/pression/vin 6$' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wine bottles all day', description_fr: 'Mer : bouteilles de vin moiti\u00e9 prix toute la journ\u00e9e' },
    { days: [6], start: '16:00', end: '23:59', description: 'Sat: Double Down - $8 doubles + $35 Corona buckets', description_fr: 'Sam : Double Down - doubles 8$ + seaux Corona 35$' },
  ], fsqId: '693387684ee14103cd61a0f7'},
  { name: 'The Clarendon Tavern', address: '11 George St', type: ['restaurant', 'bar'], lat: 45.4284, lng: -75.6942, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '17:30', description: 'Daily 3-5:30pm: $12 artisan pizzas, $7 draft/wine, $9-10 cocktails, $15 wings', description_fr: 'Tous les jours 15h-17h30 : pizzas artisanales 12$, pression/vin 7$, cocktails 9-10$, ailes 15$' },
  ], fsqId: '5d0c0233605f260023eb48a3'},
  { name: 'Pubwells on Preston', address: '96 Preston St', type: ['restaurant', 'bar'], lat: 45.4023, lng: -75.7098, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wings', description_fr: 'Mer : ailes moiti\u00e9 prix' },
    { days: [4,6], start: '19:00', end: '23:59', description: 'Thu & Sat: live music', description_fr: 'Jeu et sam : musique live' },
  ]},
  { name: 'Pubwells on Sussex', address: '431 Sussex Dr', type: ['restaurant', 'bar'], lat: 45.4320, lng: -75.6938, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wings', description_fr: 'Mer : ailes moiti\u00e9 prix' },
    { days: [5,6], start: '19:00', end: '23:59', description: 'Fri & Sat: live music', description_fr: 'Ven et sam : musique live' },
  ], fsqId: '68a917dfad353e75f9bafb71'},
  { name: "Chuck's Roadhouse Barrhaven", address: '3777 Strandherd Dr', type: ['restaurant', 'bar'], lat: 45.2741, lng: -75.7495, deals: [
    { days: [0,1,2,3,4,5,6], start: '11:00', end: '17:00', description: 'Daily 11am-5pm: $4 18oz domestic', description_fr: 'Tous les jours 11h-17h : domestique 18oz 4$' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $8 30oz domestic all day', description_fr: 'Mar : domestique 30oz 8$ toute la journ\u00e9e' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed Rib Day: $10 half rack, $15 full rack', description_fr: 'Mer journ\u00e9e c\u00f4tes lev\u00e9es : demi-rack 10$, rack complet 15$' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $12 54oz domestic all day', description_fr: 'Jeu : domestique 54oz 12$ toute la journ\u00e9e' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri Wine Day: $6 glasses of wine', description_fr: 'Ven journ\u00e9e du vin : verres de vin 6$' },
  ]},
  { name: "Chuck's Roadhouse Kanata", address: '425 Hazeldean Rd', type: ['restaurant', 'bar'], lat: 45.3145, lng: -75.9142, deals: [
    { days: [0,1,2,3,4,5,6], start: '11:00', end: '17:00', description: 'Daily 11am-5pm: $4 18oz domestic', description_fr: 'Tous les jours 11h-17h : domestique 18oz 4$' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $8 30oz domestic all day', description_fr: 'Mar : domestique 30oz 8$ toute la journ\u00e9e' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed Rib Day: $10 half rack, $15 full rack', description_fr: 'Mer journ\u00e9e c\u00f4tes lev\u00e9es : demi-rack 10$, rack complet 15$' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $12 54oz domestic all day', description_fr: 'Jeu : domestique 54oz 12$ toute la journ\u00e9e' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri Wine Day: $6 glasses of wine', description_fr: 'Ven journ\u00e9e du vin : verres de vin 6$' },
  ]},
  { name: 'The Bridge Public House', address: '1 Donald St', type: ['restaurant', 'bar'], lat: 45.4305, lng: -75.6765, deals: [
    { days: [3], start: '18:30', end: '20:30', description: 'Wed: trivia night 6:30-8:30pm', description_fr: 'Mer : soir\u00e9e quiz 18h30-20h30' },
    { days: [5], start: '17:00', end: '20:00', description: 'Select Fri: live music 5-8pm', description_fr: 'Certains ven : musique live 17h-20h' },
    { days: [6], start: '09:00', end: '14:00', description: 'Sat: brunch 9am-2pm', description_fr: 'Sam : brunch 9h-14h' },
    { days: [0], start: '09:00', end: '14:00', description: 'Sun: brunch 9am-2pm', description_fr: 'Dim : brunch 9h-14h' },
  ]},
  { name: 'State and Main Barrhaven', address: '4235 Strandherd Dr', type: ['restaurant', 'bar'], lat: 45.2635, lng: -75.7415, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm: $6 wine/soda, $7-9 draft, $10-11 cocktails, food from $7', description_fr: 'Tous les jours 14h-17h : vin/soda 6$, pression 7-9$, cocktails 10-11$, bouffe d\u00e8s 7$' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: 'Daily 9pm-close: same HH menu', description_fr: 'Tous les jours 21h-fermeture : m\u00eame menu 5 \u00e0 7' },
  ]},
  { name: 'State and Main Gloucester', address: '1880 Ogilvie Rd', type: ['restaurant', 'bar'], lat: 45.4340, lng: -75.5780, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm: $6 wine/soda, $7-9 draft, $10-11 cocktails, food from $7', description_fr: 'Tous les jours 14h-17h : vin/soda 6$, pression 7-9$, cocktails 10-11$, bouffe d\u00e8s 7$' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: 'Daily 9pm-close: same HH menu', description_fr: 'Tous les jours 21h-fermeture : m\u00eame menu 5 \u00e0 7' },
  ]},
  { name: 'The Jolly Taxpayer', address: '3050 Woodroffe Ave', type: ['restaurant', 'bar'], lat: 45.2740, lng: -75.7652, deals: [
    { days: [0,1,2,3,4,5,6], start: '11:00', end: '23:59', description: 'All day every day: $4 bar rail, $5 20oz Lot 9, $5 house wine', description_fr: 'Tous les jours : cocktails maison 4$, Lot 9 20oz 5$, vin maison 5$' },
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: 69c wings w/ drink purchase', description_fr: 'Lun : ailes \u00e0 69\u00a2 avec achat de boisson' },
  ]},
  { name: 'The Bad Alibi', address: '5935 Jeanne D\'Arc Blvd S', type: ['restaurant', 'bar'], lat: 45.4550, lng: -75.5160, deals: [
    { days: [0,1,2,3], start: '21:00', end: '23:59', description: 'Sun-Wed 9pm-close: 9 apps for $10 each w/ beverage', description_fr: 'Dim-mer 21h-fermeture : 9 entr\u00e9es \u00e0 10$ chacune avec boisson' },
  ]},
  { name: 'Corner Bar and Grill', address: '1779 Tenth Line Rd', type: ['restaurant', 'bar'], lat: 45.4740, lng: -75.5110, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm: $5 rail, $6 Pub Lite, $7 Amsterdam, $2 off wine, food from $10', description_fr: 'Tous les jours 14h-17h : maison 5$, Pub Lite 6$, Amsterdam 7$, 2$ rabais vin, bouffe d\u00e8s 10$' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close: same HH + $9 wings', description_fr: '21h-fermeture : m\u00eame 5 \u00e0 7 + ailes 9$' },
  ]},
  { name: 'REFORM Health + Fitness', address: '317 McRae Ave #300', type: ['fitness'], lat: 45.3961, lng: -75.7497, deals: [
    { days: [1,2,3,4,5], start: '06:00', end: '19:00', description: 'Indoor cycling, pilates, high-intensity classes', description_fr: 'Cyclisme int\u00e9rieur, pilates, cours haute intensit\u00e9' },
    { days: [6,0], start: '09:00', end: '12:00', description: 'Weekend classes: cycling, pilates, full-body', description_fr: 'Cours fin de semaine : cyclisme, pilates, corps complet' },
  ], fsqId: '695ff147f781bc7ec0c36303'},
  { name: 'Pure Yoga Westboro', address: '279 Richmond Rd', type: ['fitness'], lat: 45.3935, lng: -75.7520, deals: [
    { days: [0,1,2,3,4,5,6], start: '06:00', end: '21:00', description: 'Yoga classes + special workshops', description_fr: 'Cours de yoga + ateliers sp\u00e9ciaux' },
  ], fsqId: '4f627a88e4b06cb9f96eb58d'},
  { name: 'Pure Yoga Centretown', address: '359 Bank St', type: ['fitness'], lat: 45.4143, lng: -75.6950, deals: [
    { days: [0,1,2,3,4,5,6], start: '06:00', end: '21:00', description: 'Yoga classes + special workshops', description_fr: 'Cours de yoga + ateliers sp\u00e9ciaux' },
  ], fsqId: '52e2f414498e0872ec17bb2d'},
];
