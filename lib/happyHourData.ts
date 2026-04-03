export type HappyHourVenue = {
  name: string;
  address: string;
  type: ('bar' | 'restaurant' | 'club' | 'fitness')[];
  lat: number;
  lng: number;
  deals: { days: number[]; start: string; end: string; description: string }[];
  // Foursquare enrichment (populated by scripts/enrich-venues.js)
  fsqId?: string;
  rating?: number;
  photoUrl?: string;
  lastVerified?: string;
};

export const HAPPY_HOUR_VENUES: HappyHourVenue[] = [
  { name: "Joey's Lansdowne", address: '825 Exhibition Way', type: ['bar', 'restaurant'], lat: 45.3998, lng: -75.6844, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Happy Hour daily 3-6pm' },
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm-close specials' },
    { days: [2], start: '15:00', end: '23:59', description: 'Up to 50% off wine Tuesdays' },
  ], fsqId: '552aafb8498e5d11808ced72'},
  { name: "Joey's Rideau", address: '50 Rideau St', type: ['bar', 'restaurant'], lat: 45.4260, lng: -75.6916, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Happy Hour daily 3-6pm' },
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm-close specials' },
    { days: [2], start: '15:00', end: '23:59', description: 'Up to 50% off wine Tuesdays' },
  ], fsqId: '59372e23f1fdaf456f0c9409'},
  { name: 'Local Public Eatery', address: '825 Exhibition Way', type: ['bar', 'restaurant'], lat: 45.3999, lng: -75.6840, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm happy hour' },
    { days: [6], start: '10:00', end: '14:00', description: 'Sat drinks only 10am-2pm' },
    { days: [0,1,2], start: '21:00', end: '23:59', description: 'Sun-Wed 9pm-close specials' },
    { days: [3,4,5,6], start: '22:00', end: '23:59', description: 'Thu-Sat 10pm-close specials' },
  ], fsqId: '59414511cf72a05e597432b2'},
  { name: 'Pour Boy', address: '495 Somerset St W', type: ['bar', 'restaurant'], lat: 45.4138, lng: -75.7005, deals: [
    { days: [1], start: '11:00', end: '23:59', description: '25% off wings Monday' },
    { days: [2], start: '19:00', end: '23:59', description: 'Trivia night Tuesday' },
    { days: [3], start: '19:00', end: '23:59', description: 'Open Mic Wednesday' },
    { days: [4], start: '19:00', end: '23:59', description: 'Comedy night Thursday' },
    { days: [5], start: '11:00', end: '23:59', description: '25% off fish & chips + Blingo Friday' },
  ], fsqId: '5190118c498e91f3c397aacd'},
  { name: 'Rabbit Hole', address: '208 Sparks St', type: ['bar', 'restaurant', 'club'], lat: 45.4212, lng: -75.7010, deals: [
    { days: [2], start: '16:00', end: '18:00', description: 'Tue HH 4-6pm' },
    { days: [2], start: '17:00', end: '23:59', description: 'Half off wine + half off pizzas 5pm-late Tue' },
    { days: [3], start: '16:00', end: '18:00', description: 'Wed HH 4-6pm + half price oysters' },
    { days: [4], start: '16:00', end: '18:00', description: 'Thu HH 4-6pm' },
    { days: [5,6], start: '21:00', end: '23:59', description: 'Fri/Sat Live DJ' },
  ], fsqId: '5c09953c1af852002c198160'},
  { name: 'Whalesbone', address: '430 Bank St', type: ['restaurant', 'bar'], lat: 45.4122, lng: -75.6939, deals: [
    { days: [0], start: '17:00', end: '23:59', description: 'Oysters ~$2 each Sunday nights' },
  ], fsqId: '4b789c4cf964a5200eda2ee3'},
  { name: "Lieutenant's Pump", address: '361 Elgin St', type: ['restaurant', 'bar', 'club'], lat: 45.4153, lng: -75.6878, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wednesday wing day - half price' },
    { days: [1,2,3,4,5], start: '11:00', end: '14:00', description: 'Lunch combo: pint + supper $5' },
  ], fsqId: '4b0586def964a520597222e3'},
  { name: 'The Standard', address: '360 Elgin St', type: ['restaurant', 'bar', 'club'], lat: 45.4153, lng: -75.6884, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Happy Hour 7 days a week 5-7pm' },
  ], fsqId: '4b073355f964a52079f922e3'},
  { name: 'Heart and Crown ByWard', address: '67 Clarence St', type: ['restaurant', 'bar', 'club'], lat: 45.4290, lng: -75.6935, deals: [
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: $5 house draught' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: half price wine' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: $5 rail cocktails' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $5 quarts and craft cans' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $6 bloody caesars' },
  ], fsqId: '4ad8ec60f964a5200c1621e3'},
  { name: 'Heart and Crown Preston', address: '361 Preston St', type: ['restaurant', 'bar', 'club'], lat: 45.4011, lng: -75.7096, deals: [
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: $5 house draught' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: half price wine' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: $5 rail cocktails' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $5 quarts and craft cans' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $6 bloody caesars' },
  ], fsqId: '4b3cc0baf964a520d48625e3'},
  { name: 'Union Local 613', address: '315 Somerset St W', type: ['restaurant', 'bar'], lat: 45.4161, lng: -75.6949, deals: [
    { days: [1,2,3,4,5], start: '16:00', end: '17:00', description: 'Mon-Fri 4-5pm: half price wine, $6 draft, cheap cocktails' },
  ], fsqId: '5005ecd7e4b0645daf340728'},
  { name: 'Senate Bank', address: '259 Bank St', type: ['restaurant', 'bar'], lat: 45.4162, lng: -75.6968, deals: [
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $15 wings 5pm+, $7 lagers + $5 Jameson late' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $5 tequila + $12 margs all day' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: AYCE wings $28 + $15 mini pitcher' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $15 fish & chips, $5 tequila + $12 margs' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $30 bottle of wine' },
    { days: [0], start: '14:00', end: '17:00', description: 'Sun: $5 caesars, double HH 2-5pm' },
    { days: [0], start: '23:00', end: '23:59', description: 'Sun: double HH 11pm-2am' },
  ]},
  { name: 'Senate Clarence', address: '83 Clarence St', type: ['restaurant', 'bar'], lat: 45.4293, lng: -75.6931, deals: [
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $15 wings 5pm+, $7 lagers + $5 Jameson late' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $5 tequila + $12 margs all day' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: AYCE wings $28 + $15 mini pitcher' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $15 fish & chips, $5 tequila + $12 margs' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $30 bottle of wine' },
    { days: [0], start: '14:00', end: '17:00', description: 'Sun: $5 caesars, double HH 2-5pm' },
    { days: [0], start: '23:00', end: '23:59', description: 'Sun: double HH 11pm-2am' },
  ], fsqId: '50aed23ae4b0d8a9ef9dcd04'},
  { name: 'Senate Wellington', address: '93 Wellington St', type: ['restaurant', 'bar'], lat: 45.4233, lng: -75.6987, deals: [
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $15 wings 5pm+, $7 lagers + $5 Jameson late' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $5 tequila + $12 margs all day' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: AYCE wings $28 + $15 mini pitcher' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $15 fish & chips, $5 tequila + $12 margs' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $30 bottle of wine' },
    { days: [0], start: '14:00', end: '17:00', description: 'Sun: $5 caesars, double HH 2-5pm' },
    { days: [0], start: '23:00', end: '23:59', description: 'Sun: double HH 11pm-2am' },
  ]},
  { name: 'Barley Mow Merivale', address: '1541 Merivale Rd', type: ['restaurant', 'bar'], lat: 45.3555, lng: -75.7352, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm HH' },
    { days: [3], start: '20:00', end: '23:59', description: 'Wed 8pm: 30c wings' },
    { days: [4], start: '20:00', end: '23:59', description: 'Thu 8pm: Thirsty Thursdays' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $27 special + $9 beer flights' },
    { days: [2], start: '17:00', end: '23:59', description: 'Tue: $27 tacos + $10 margaritas' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: $27 sandwich + $30 wine bottles' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: $27 burger' },
    { days: [5], start: '17:00', end: '23:59', description: 'Fri: $27 fish & chips + $36.95 prime rib' },
    { days: [6,0], start: '11:00', end: '23:59', description: 'Sat/Sun: $7.50 caesars. Sun: kids eat free' },
  ], fsqId: '5827c286089b755fe52f6954'},
  { name: 'Barley Mow Westboro', address: '399 Richmond Rd', type: ['restaurant', 'bar'], lat: 45.3910, lng: -75.7566, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm HH' },
    { days: [3], start: '20:00', end: '23:59', description: 'Wed 8pm: 30c wings' },
    { days: [4], start: '20:00', end: '23:59', description: 'Thu 8pm: Thirsty Thursdays' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: $27 special + $9 beer flights' },
    { days: [2], start: '17:00', end: '23:59', description: 'Tue: $27 tacos + $10 margaritas' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: $27 sandwich + $30 wine bottles' },
    { days: [4], start: '17:00', end: '23:59', description: 'Thu: $27 burger' },
    { days: [5], start: '17:00', end: '23:59', description: 'Fri: $27 fish & chips + $36.95 prime rib' },
    { days: [6,0], start: '11:00', end: '23:59', description: 'Sat/Sun: $7.50 caesars. Sun: kids eat free' },
  ], fsqId: '54ac7e16498ef7a42cd42c0b'},
  { name: 'Royal Oak Wellington', address: '1217 Wellington St W', type: ['restaurant', 'bar'], lat: 45.4002, lng: -75.7313, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts' },
  ], fsqId: '4b08418df964a5207f0723e3'},
  { name: 'Royal Oak Bank', address: '188 Bank St', type: ['restaurant', 'bar'], lat: 45.4178, lng: -75.6986, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts' },
  ], fsqId: '4b1b1169f964a52086f723e3'},
  { name: 'Royal Oak Slater', address: '180 Kent St', type: ['restaurant', 'bar'], lat: 45.4180, lng: -75.7017, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts' },
  ], fsqId: '4bc0acccabf49521769cbf93'},
  { name: "Jack Astor's Lansdowne", address: '425 Marche Way', type: ['restaurant', 'bar'], lat: 45.4008, lng: -75.6830, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue' },
  ], fsqId: '551ecc37498e282ec09386bc'},
  { name: "Jack Astor's Hunt Club", address: '310 W Hunt Club Rd', type: ['restaurant', 'bar'], lat: 45.3391, lng: -75.7129, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue' },
  ]},
  { name: "Jack Astor's Kanata", address: '125 Roland Michener Dr', type: ['restaurant', 'bar'], lat: 45.3085, lng: -75.9131, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue' },
  ], fsqId: '4b67496cf964a520f1452be3'},
  { name: 'Shore Club', address: '11 Colonel By Dr', type: ['restaurant', 'bar'], lat: 45.4250, lng: -75.6927, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '17:00', description: 'Daily 3-5pm: half price oysters, $2 prawns, $3.50 sliders, $9 Heineken, $12 wine' },
  ], fsqId: '4ca92d1997c8a1cdbfa58ca5'},
  { name: 'Drip House', address: '692 Somerset St W', type: ['bar'], lat: 45.4110, lng: -75.7065, deals: [
    { days: [3,4,5], start: '16:30', end: '18:30', description: 'Wed-Fri 4:30-6:30pm: $9 cocktails, wine, and appetizers' },
  ], fsqId: '60f85ba01d6ca603569e8e81'},
  { name: 'Baton Rouge Downtown', address: '360 Albert St', type: ['restaurant', 'bar'], lat: 45.4181, lng: -75.7038, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails' },
  ], fsqId: '4b197777f964a520d7dd23e3'},
  { name: 'Baton Rouge Hunt Club', address: '270 W Hunt Club Rd', type: ['restaurant', 'bar'], lat: 45.3396, lng: -75.7110, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails' },
  ], fsqId: '566f3e6f498eded04dd25d78'},
  { name: 'Baton Rouge Kanata', address: '790 Earl Grey Dr', type: ['restaurant', 'bar'], lat: 45.3106, lng: -75.9095, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails' },
  ], fsqId: '4b26a070f964a520937e24e3'},
  { name: 'Craft Beer Market', address: '975 Bank St', type: ['bar'], lat: 45.3987, lng: -75.6856, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm HH: discounted craft beer, wine, cocktails' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close HH' },
    { days: [0], start: '11:00', end: '23:59', description: 'All-day specials Sundays' },
  ], fsqId: '5721372438fa52a01938e14e'},
  { name: 'The Waverly', address: '339 Elgin St', type: ['bar', 'club'], lat: 45.4150, lng: -75.6880, deals: [
    { days: [5,6], start: '22:00', end: '23:30', description: 'Fri/Sat 10-11:30pm: $5 bar rail' },
  ], fsqId: '5555a299498ec38e4f69398d'},
  { name: 'House of TARG', address: '1077 Bank St', type: ['restaurant', 'bar', 'club'], lat: 45.3943, lng: -75.6832, deals: [
    { days: [2], start: '17:00', end: '23:00', description: 'Tue: $12.50 unlimited arcade 5-11pm' },
    { days: [0], start: '20:00', end: '23:59', description: 'Sun: Free-Play After Dark $12.50 8pm-12am' },
    { days: [3,4,5,6], start: '20:00', end: '23:59', description: 'Thu-Sat: live music from 8pm, $10-20 cover' },
  ], fsqId: '51df648834561cc46c3e6ce3'},
  { name: 'Level One Game Pub', address: '14 Waller St', type: ['restaurant', 'bar'], lat: 45.4262, lng: -75.6885, deals: [
    { days: [1], start: '18:30', end: '20:00', description: 'Mon: Geek Trivia 6:30-8pm, free w/ purchase' },
    { days: [2], start: '17:30', end: '20:00', description: 'Tue: T.K.O. fight night 5:30-8pm, $6' },
    { days: [4], start: '18:00', end: '23:00', description: 'Thu: Reddit board game meetup 6pm' },
    { days: [0], start: '17:00', end: '23:00', description: 'Sun: Magic: The Gathering 5pm, $6 w/ purchase' },
  ], fsqId: '56e61689498e951537d3f9ed'},
  { name: 'Happy Fish', address: '330 Elgin St', type: ['bar', 'club'], lat: 45.4153, lng: -75.6882, deals: [
    { days: [4], start: '21:00', end: '23:59', description: 'Thu: $5 Jagerbombs + $5 draught 9pm-2am' },
    { days: [5,6], start: '21:00', end: '23:59', description: 'Fri/Sat: open 9pm-2am' },
  ], fsqId: '868f6fef88064d68e8563e15'},
  { name: 'Gridworks', address: '221 Rideau St', type: ['club'], lat: 45.4280, lng: -75.6890, deals: [
    { days: [4], start: '22:00', end: '23:59', description: 'Thu: Concepthursday night' },
    { days: [5], start: '22:00', end: '23:59', description: 'Fri: weekly events (Signal, Intersection)' },
    { days: [6], start: '22:00', end: '23:59', description: 'Sat: Off Grid night' },
  ]},
  { name: 'City At Night', address: '222 Slater St', type: ['club'], lat: 45.4186, lng: -75.7002, deals: [
    { days: [5], start: '22:00', end: '23:59', description: 'Fri: weekly electronic events' },
    { days: [6], start: '22:00', end: '23:59', description: 'Sat: White Rabbit tech house' },
  ], fsqId: '5834b21e13bb777f467bf1c5'},
  { name: 'Hintonburg Public House', address: '1020 Wellington St W', type: ['restaurant', 'bar'], lat: 45.3970, lng: -75.7270, deals: [
    { days: [0,1,2,3,4,5,6], start: '16:00', end: '18:00', description: 'Daily 4-6pm: Old Style Pils + bar mix $10' },
    { days: [1], start: '11:30', end: '23:59', description: 'Mon: 20% off main course w/ beverage' },
    { days: [2], start: '16:00', end: '23:59', description: 'Tue: nacho night $18' },
    { days: [3], start: '16:00', end: '23:59', description: 'Wed: burger + beer + bar mix $30' },
    { days: [4], start: '11:30', end: '23:59', description: 'Thu: 50% off kids mains' },
    { days: [5], start: '11:30', end: '18:00', description: 'Fri: fish & chips + $8 draft 11:30am-6pm' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $8 craft drafts + $5 Jameson (service industry)' },
  ]},
  { name: 'Prohibition Public House', address: '337 Somerset St W', type: ['restaurant', 'bar'], lat: 45.4159, lng: -75.6948, deals: [
    { days: [1,2,3,4,5], start: '17:00', end: '18:00', description: 'Mon-Fri 5-6pm: $12 margs, $10 sangria, $6 wine/pilsner, 40% off apps' },
  ], fsqId: '5764825e498e720858e533cf'},
  { name: 'Apothecary Lounge', address: '54 York St', type: ['restaurant', 'bar'], lat: 45.4280, lng: -75.6940, deals: [
    { days: [0,1,2,3,4], start: '22:00', end: '23:59', description: 'Sun-Thu 10pm-midnight: half price martinis, wine, First Light draft' },
  ], fsqId: '60e1f5740e501b1ba8b0ce39'},
  { name: 'ALORA Ottawa', address: '34 Clarence St', type: ['restaurant', 'bar'], lat: 45.4290, lng: -75.6937, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Daily 5-7pm happy hour' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wine bottles' },
  ], fsqId: '653c4394a627d9780286fe61'},
  { name: '10Fourteen', address: '1014 Wellington St W', type: ['restaurant', 'bar'], lat: 45.3971, lng: -75.7265, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Daily 5-7pm: $8 wine, $6 draft, 20% off charcuterie' },
    { days: [5], start: '21:00', end: '23:59', description: 'Fri: DJ night from 9pm' },
  ]},
  { name: 'The Gilmour', address: '313 Bank St', type: ['restaurant', 'bar'], lat: 45.4165, lng: -75.6966, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Daily 3-6pm: happy hour beer, wine, fries' },
  ], fsqId: '62e6a8440dd547639eb1f3f1'},
  { name: "Grey's Social Eatery", address: '2 Byward Market Square', type: ['restaurant', 'bar'], lat: 45.4274, lng: -75.6930, deals: [
    { days: [0,1,2,3,4,5,6], start: '16:00', end: '18:00', description: 'Daily 4-6pm: $6 highballs/draught/wine + app specials' },
    { days: [0,1,2,3,4,5,6], start: '22:00', end: '23:59', description: 'Daily 10pm-late: $6 highballs/draught/wine' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wine bottles all day' },
    { days: [6], start: '16:00', end: '23:59', description: 'Sat: Double Down - $8 doubles + $35 Corona buckets' },
  ], fsqId: '693387684ee14103cd61a0f7'},
  { name: 'The Clarendon Tavern', address: '11 George St', type: ['restaurant', 'bar'], lat: 45.4284, lng: -75.6942, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '17:30', description: 'Daily 3-5:30pm: $12 artisan pizzas, $7 draft/wine, $9-10 cocktails, $15 wings' },
  ], fsqId: '5d0c0233605f260023eb48a3'},
  { name: 'Pubwells on Preston', address: '96 Preston St', type: ['restaurant', 'bar'], lat: 45.4023, lng: -75.7098, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wings' },
    { days: [4,6], start: '19:00', end: '23:59', description: 'Thu & Sat: live music' },
  ]},
  { name: 'Pubwells on Sussex', address: '431 Sussex Dr', type: ['restaurant', 'bar'], lat: 45.4320, lng: -75.6938, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: half-price wings' },
    { days: [5,6], start: '19:00', end: '23:59', description: 'Fri & Sat: live music' },
  ], fsqId: '68a917dfad353e75f9bafb71'},
  { name: "Chuck's Roadhouse Barrhaven", address: '3777 Strandherd Dr', type: ['restaurant', 'bar'], lat: 45.2741, lng: -75.7495, deals: [
    { days: [0,1,2,3,4,5,6], start: '11:00', end: '17:00', description: 'Daily 11am-5pm: $4 18oz domestic' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $8 30oz domestic all day' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed Rib Day: $10 half rack, $15 full rack' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $12 54oz domestic all day' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri Wine Day: $6 glasses of wine' },
  ]},
  { name: "Chuck's Roadhouse Kanata", address: '425 Hazeldean Rd', type: ['restaurant', 'bar'], lat: 45.3145, lng: -75.9142, deals: [
    { days: [0,1,2,3,4,5,6], start: '11:00', end: '17:00', description: 'Daily 11am-5pm: $4 18oz domestic' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: $8 30oz domestic all day' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed Rib Day: $10 half rack, $15 full rack' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $12 54oz domestic all day' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri Wine Day: $6 glasses of wine' },
  ]},
  { name: 'The Bridge Public House', address: '1 Donald St', type: ['restaurant', 'bar'], lat: 45.4305, lng: -75.6765, deals: [
    { days: [3], start: '18:30', end: '20:30', description: 'Wed: trivia night 6:30-8:30pm' },
    { days: [5], start: '17:00', end: '20:00', description: 'Select Fri: live music 5-8pm' },
    { days: [6], start: '09:00', end: '14:00', description: 'Sat: brunch 9am-2pm' },
    { days: [0], start: '09:00', end: '14:00', description: 'Sun: brunch 9am-2pm' },
  ]},
  { name: 'State and Main Barrhaven', address: '4235 Strandherd Dr', type: ['restaurant', 'bar'], lat: 45.2635, lng: -75.7415, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm: $6 wine/soda, $7-9 draft, $10-11 cocktails, food from $7' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: 'Daily 9pm-close: same HH menu' },
  ]},
  { name: 'State and Main Gloucester', address: '1880 Ogilvie Rd', type: ['restaurant', 'bar'], lat: 45.4340, lng: -75.5780, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm: $6 wine/soda, $7-9 draft, $10-11 cocktails, food from $7' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: 'Daily 9pm-close: same HH menu' },
  ]},
  { name: 'The Jolly Taxpayer', address: '3050 Woodroffe Ave', type: ['restaurant', 'bar'], lat: 45.2740, lng: -75.7652, deals: [
    { days: [0,1,2,3,4,5,6], start: '11:00', end: '23:59', description: 'All day every day: $4 bar rail, $5 20oz Lot 9, $5 house wine' },
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: 69c wings w/ drink purchase' },
  ]},
  { name: 'The Bad Alibi', address: '5935 Jeanne D\'Arc Blvd S', type: ['restaurant', 'bar'], lat: 45.4550, lng: -75.5160, deals: [
    { days: [0,1,2,3], start: '21:00', end: '23:59', description: 'Sun-Wed 9pm-close: 9 apps for $10 each w/ beverage' },
  ]},
  { name: 'Corner Bar and Grill', address: '1779 Tenth Line Rd', type: ['restaurant', 'bar'], lat: 45.4740, lng: -75.5110, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm: $5 rail, $6 Pub Lite, $7 Amsterdam, $2 off wine, food from $10' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close: same HH + $9 wings' },
  ]},
  { name: 'REFORM Health + Fitness', address: '317 McRae Ave #300', type: ['fitness'], lat: 45.3961, lng: -75.7497, deals: [
    { days: [1,2,3,4,5], start: '06:00', end: '19:00', description: 'Indoor cycling, pilates, high-intensity classes' },
    { days: [6,0], start: '09:00', end: '12:00', description: 'Weekend classes: cycling, pilates, full-body' },
  ], fsqId: '695ff147f781bc7ec0c36303'},
  { name: 'Pure Yoga Westboro', address: '279 Richmond Rd', type: ['fitness'], lat: 45.3935, lng: -75.7520, deals: [
    { days: [0,1,2,3,4,5,6], start: '06:00', end: '21:00', description: 'Yoga classes + special workshops' },
  ], fsqId: '4f627a88e4b06cb9f96eb58d'},
  { name: 'Pure Yoga Centretown', address: '359 Bank St', type: ['fitness'], lat: 45.4143, lng: -75.6950, deals: [
    { days: [0,1,2,3,4,5,6], start: '06:00', end: '21:00', description: 'Yoga classes + special workshops' },
  ], fsqId: '52e2f414498e0872ec17bb2d'},
];
