/**
 * Campus data for uOttawa, Carleton, and Algonquin.
 * Shuttle schedules, library hours, U-Pass info, and food location bounds.
 */

export type CampusId = 'uottawa' | 'carleton' | 'algonquin';

export type ShuttleRoute = {
  id: string;
  label_en: string;
  label_fr: string;
  stops: string[];
  /** Departure times from origin, in 'HH:MM' 24h format (weekdays only) */
  departures: string[];
  note_en?: string;
  note_fr?: string;
};

export type LibraryHours = {
  name: string;
  campus: CampusId;
  lat: number;
  lng: number;
  /** [open, close] in 'HH:MM' 24h format, per day index (0=Sun, 6=Sat) */
  hours: { [day: number]: [string, string] | null };
  note_en: string;
  note_fr: string;
};

export type UPassInfo = {
  cost: string;
  coverage_en: string;
  coverage_fr: string;
  validity_en: string;
  validity_fr: string;
  url: string;
};

export type StudySpot = {
  name: string;
  name_fr: string;
  lat: number;
  lng: number;
  description_en: string;
  description_fr: string;
};

export type CampusConfig = {
  id: CampusId;
  name: string;
  name_fr: string;
  accent: string;
  lat: number;
  lng: number;
  shuttles: ShuttleRoute[];
  libraries: LibraryHours[];
  upass: UPassInfo;
  studySpots: StudySpot[];
  /** Bounding box for food search [lat, lng] */
  foodCenter: { lat: number; lng: number };
  foodRadius: number;
  buswhereUrl: string;
  /** Shuttle destination for "Can't catch shuttle?" routing */
  shuttleDestination?: { name: string; lat: number; lng: number };
};

// ── Shuttle schedules (weekday, from uOttawa PDF) ──────────────────

const UOTTAWA_SHUTTLES: ShuttleRoute[] = [
  {
    id: 'main-to-rg',
    label_en: 'Main Campus → Roger Guindon',
    label_fr: 'Campus principal → Roger Guindon',
    stops: ['Tabaret Hall (Main)', 'Saint Paul University', 'Roger Guindon Health Sciences'],
    departures: [
      '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
      '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00',
      '15:30', '16:00', '16:30', '17:00', '17:30', '18:00',
    ],
    note_en: 'Weekdays only during Fall/Winter term. ~15 min ride.',
    note_fr: 'Jours de semaine seulement pendant les sessions automne/hiver. ~15 min.',
  },
  {
    id: 'rg-to-main',
    label_en: 'Roger Guindon → Main Campus',
    label_fr: 'Roger Guindon → Campus principal',
    stops: ['Roger Guindon Health Sciences', 'Saint Paul University', 'Tabaret Hall (Main)'],
    departures: [
      '07:45', '08:15', '08:45', '09:15', '09:45', '10:15', '10:45', '11:15',
      '11:45', '12:15', '12:45', '13:15', '13:45', '14:15', '14:45', '15:15',
      '15:45', '16:15', '16:45', '17:15', '17:45', '18:15',
    ],
    note_en: 'Weekdays only during Fall/Winter term. ~15 min ride.',
    note_fr: 'Jours de semaine seulement pendant les sessions automne/hiver. ~15 min.',
  },
];

// ── Library hours ──────────────────────────────────────────────────

const LIBRARIES: LibraryHours[] = [
  {
    name: 'Morisset Library (uOttawa)',
    campus: 'uottawa',
    lat: 45.4234, lng: -75.6836,
    hours: {
      0: ['10:00', '16:30'], // Sun
      1: ['08:00', '21:00'], // Mon
      2: ['08:00', '21:00'], // Tue
      3: ['08:00', '21:00'], // Wed
      4: ['08:00', '21:00'], // Thu
      5: ['08:00', '18:00'], // Fri
      6: ['10:00', '16:30'], // Sat
    },
    note_en: 'Hours subject to change during exams/breaks',
    note_fr: 'Heures sujettes à changement pendant les examens/congés',
  },
  {
    name: 'MacOdrum Library (Carleton)',
    campus: 'carleton',
    lat: 45.3884, lng: -75.6957,
    hours: {
      0: ['10:00', '23:59'],
      1: ['07:30', '23:59'],
      2: ['07:30', '23:59'],
      3: ['07:30', '23:59'],
      4: ['07:30', '23:59'],
      5: ['07:30', '21:00'],
      6: ['10:00', '23:59'],
    },
    note_en: 'Hours subject to change during exams/breaks',
    note_fr: 'Heures sujettes à changement pendant les examens/congés',
  },
  {
    name: 'Library (Algonquin)',
    campus: 'algonquin',
    lat: 45.3497, lng: -75.7558,
    hours: {
      0: null, // closed
      1: ['08:00', '17:00'],
      2: ['08:00', '17:00'],
      3: ['08:00', '17:00'],
      4: ['08:00', '17:00'],
      5: ['08:00', '17:00'],
      6: ['11:00', '15:00'],
    },
    note_en: 'Hours subject to change during exams/breaks',
    note_fr: 'Heures sujettes à changement pendant les examens/congés',
  },
];

// ── U-Pass info ────────────────────────────────────────────────────

const UPASS: UPassInfo = {
  cost: '$240.52/term',
  coverage_en: 'All OC Transpo + STO routes',
  coverage_fr: 'Toutes les lignes OC Transpo + STO',
  validity_en: 'Sept–Dec (fall) · Jan–Apr (winter)',
  validity_fr: 'Sept–déc (automne) · Jan–avr (hiver)',
  url: 'https://www.octranspo.com/en/fares/u-pass/',
};

// ── Campus configs ─────────────────────────────────────────────────

export const CAMPUSES: CampusConfig[] = [
  {
    id: 'uottawa',
    name: 'University of Ottawa',
    name_fr: 'Université d\'Ottawa',
    accent: '#8F001A',
    lat: 45.4231,
    lng: -75.6831,
    shuttles: UOTTAWA_SHUTTLES,
    libraries: LIBRARIES.filter(l => l.campus === 'uottawa'),
    upass: UPASS,
    studySpots: [
      { name: 'Morisset Library', name_fr: 'Bibliothèque Morisset', lat: 45.4234, lng: -75.6836, description_en: 'Main library, 4 floors of study space', description_fr: 'Bibliothèque principale, 4 étages d\'espaces d\'étude' },
      { name: 'Desmarais Hall', name_fr: 'Pavillon Desmarais', lat: 45.4227, lng: -75.6830, description_en: 'Atrium, study lounges, group rooms', description_fr: 'Atrium, salons d\'étude, salles de groupe' },
      { name: 'STEM Complex', name_fr: 'Complexe STEM', lat: 45.4243, lng: -75.6854, description_en: 'Modern building, open study areas', description_fr: 'Bâtiment moderne, aires d\'étude ouvertes' },
      { name: 'Learning Crossroads (CRX)', name_fr: 'Carrefour des apprentissages', lat: 45.4236, lng: -75.6829, description_en: 'Active learning classrooms, study pods', description_fr: 'Salles d\'apprentissage actif, capsules d\'étude' },
    ],
    foodCenter: { lat: 45.4231, lng: -75.6831 },
    foodRadius: 800,
    buswhereUrl: 'https://apps.apple.com/ca/app/buswhere-uottawa/id1118405893',
    shuttleDestination: { name: 'Roger Guindon Health Sciences', lat: 45.4168, lng: -75.6498 },
  },
  {
    id: 'carleton',
    name: 'Carleton University',
    name_fr: 'Université Carleton',
    accent: '#BF112B',
    lat: 45.3876,
    lng: -75.6960,
    shuttles: [],
    libraries: LIBRARIES.filter(l => l.campus === 'carleton'),
    upass: UPASS,
    studySpots: [
      { name: 'MacOdrum Library', name_fr: 'Bibliothèque MacOdrum', lat: 45.3884, lng: -75.6957, description_en: 'Main library, silent and group study floors', description_fr: 'Bibliothèque principale, étages silencieux et en groupe' },
      { name: 'Dunton Tower', name_fr: 'Tour Dunton', lat: 45.3882, lng: -75.6948, description_en: 'Lounge areas on upper floors', description_fr: 'Espaces lounge aux étages supérieurs' },
      { name: 'Richcraft Hall', name_fr: 'Pavillon Richcraft', lat: 45.3859, lng: -75.6954, description_en: 'Business building, open atrium', description_fr: 'Bâtiment de commerce, atrium ouvert' },
      { name: 'Canal Building', name_fr: 'Pavillon du Canal', lat: 45.3862, lng: -75.6981, description_en: 'Engineering building, study nooks', description_fr: 'Bâtiment de génie, coins d\'étude' },
    ],
    foodCenter: { lat: 45.3876, lng: -75.6960 },
    foodRadius: 600,
    buswhereUrl: '',
  },
  {
    id: 'algonquin',
    name: 'Algonquin College',
    name_fr: 'Collège Algonquin',
    accent: '#006341',
    lat: 45.3499,
    lng: -75.7559,
    shuttles: [],
    libraries: LIBRARIES.filter(l => l.campus === 'algonquin'),
    upass: UPASS,
    studySpots: [
      { name: 'Library (C Building)', name_fr: 'Bibliothèque (Pavillon C)', lat: 45.3497, lng: -75.7558, description_en: 'Main library, quiet study zones', description_fr: 'Bibliothèque principale, zones d\'étude calmes' },
      { name: 'Student Commons', name_fr: 'Centre étudiant', lat: 45.3502, lng: -75.7550, description_en: 'Open lounge with tables and outlets', description_fr: 'Salon ouvert avec tables et prises' },
    ],
    foodCenter: { lat: 45.3499, lng: -75.7559 },
    foodRadius: 500,
    buswhereUrl: '',
  },
];

// ── Helpers ────────────────────────────────────────────────────────

/** Get next departure time and minutes until it */
export function getNextDeparture(departures: string[]): { time: string; minsAway: number } | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const dep of departures) {
    const [h, m] = dep.split(':').map(Number);
    const depMins = h * 60 + m;
    if (depMins > nowMins) {
      return { time: dep, minsAway: depMins - nowMins };
    }
  }
  return null; // no more departures today
}

/** Check if a library is currently open */
export function isLibraryOpen(lib: LibraryHours): { open: boolean; closesAt?: string; opensAt?: string } {
  const now = new Date();
  const day = now.getDay();
  const hours = lib.hours[day];
  if (!hours) return { open: false };
  const [openStr, closeStr] = hours;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = openStr.split(':').map(Number);
  const [ch, cm] = closeStr.split(':').map(Number);
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  if (nowMins >= openMins && nowMins < closeMins) {
    return { open: true, closesAt: closeStr };
  }
  if (nowMins < openMins) {
    return { open: false, opensAt: openStr };
  }
  return { open: false };
}

/** Format 24h time string to 12h display */
export function fmt12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Get day name for hours display */
export function getDayLabel(day: number, lang: string): string {
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fr = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return lang === 'fr' ? fr[day] : en[day];
}
