// Local Ottawa events — hardcoded schedules for recurring/known events
// that don't appear on Ticketmaster or Eventbrite reliably.

export type LocalEvent = {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  time?: string;
  venue: string;
  address: string;
  url: string;
  category: string;
  free: boolean;
  description?: string;
};

const FLEA_VENUE = 'Aberdeen Pavilion, Lansdowne Park';
const FLEA_ADDRESS = '1015 Bank St, Ottawa';
const FLEA_URL = 'https://613flea.ca';
const FLEA_DESC = '150 vendors. Handmade, antiques, vintage clothing, great food & one-of-a-kinds. Dogs welcome. Free admission.';

function fmt24to12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

const FLEA_DATES_2026 = [
  '2026-01-10', '2026-01-31',
  '2026-02-14', '2026-02-28',
  '2026-03-07', '2026-03-21',
  '2026-04-04', '2026-04-18',
  '2026-05-02', '2026-05-16',
  '2026-06-06', '2026-06-20',
  '2026-07-04', '2026-07-18',
  '2026-08-01', '2026-08-15',
  '2026-09-05', '2026-09-19',
  '2026-10-03', '2026-10-17',
  '2026-11-07', '2026-11-21',
];

const FLEA_CHRISTMAS = [
  { date: '2026-12-05', name: '613Christmas at Carleton University' },
  { date: '2026-12-06', name: '613Christmas at Carleton University' },
];

const TD_PLACE = 'TD Place Stadium';
const TD_PLACE_ADDRESS = '1015 Bank St, Ottawa';

// Ottawa Charge (PWHL) — TD Place
const CHARGE_EVENTS: Omit<LocalEvent, 'id'>[] = [
  { name: 'Ottawa Charge vs Seattle Torrent', date: '2026-04-08', time: '19:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://thepwhl.com/en/stats/team/10', category: 'Sports', free: false },
  { name: 'Ottawa Charge vs New York Sirens', date: '2026-04-18', time: '14:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://thepwhl.com/en/stats/team/10', category: 'Sports', free: false },
  { name: 'Ottawa Charge vs Toronto Sceptres', date: '2026-04-25', time: '19:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://thepwhl.com/en/stats/team/10', category: 'Sports', free: false },
];

// Ottawa Blackjacks (CEBL) — TD Place
const BLACKJACKS_EVENTS: Omit<LocalEvent, 'id'>[] = [
  { name: 'Blackjacks vs Surge', date: '2026-05-12', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs River Lions', date: '2026-05-18', time: '19:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Honey Badgers', date: '2026-05-21', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Alliance', date: '2026-05-23', time: '19:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Bandits', date: '2026-06-02', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Sea Bears', date: '2026-06-04', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs SSK', date: '2026-06-21', time: '19:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Shooting Stars', date: '2026-06-23', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs River Lions', date: '2026-06-28', time: '13:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Alliance', date: '2026-07-08', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Honey Badgers', date: '2026-07-12', time: '16:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
  { name: 'Blackjacks vs Shooting Stars', date: '2026-07-22', time: '19:30', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://cebl.ca/team/ottawa-blackjacks', category: 'Sports', free: false },
];

// Ottawa 67's (OHL) — TD Place
const SIXTYSEVENS_EVENTS: Omit<LocalEvent, 'id'>[] = [
  { name: "Ottawa 67's vs Oshawa Generals", date: '2026-03-18', time: '15:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://ontariohockeyleague.com/team/30/ottawa-67s', category: 'Sports', free: false },
  { name: "Ottawa 67's vs Kingston Frontenacs", date: '2026-03-21', time: '15:00', venue: TD_PLACE, address: TD_PLACE_ADDRESS, url: 'https://ontariohockeyleague.com/team/30/ottawa-67s', category: 'Sports', free: false },
];

/** Get all local events that are today or in the future */
export function getLocalEvents(): LocalEvent[] {
  const today = new Date().toLocaleDateString('en-CA');
  const events: LocalEvent[] = [];

  // 613flea regular dates
  for (const date of FLEA_DATES_2026) {
    if (date >= today) {
      events.push({
        id: `613flea_${date}`,
        name: '613flea Market',
        date,
        time: '10am - 4pm',
        venue: FLEA_VENUE,
        address: FLEA_ADDRESS,
        url: FLEA_URL,
        category: 'Market',
        free: true,
        description: FLEA_DESC,
      });
    }
  }

  // 613Christmas
  for (const xmas of FLEA_CHRISTMAS) {
    if (xmas.date >= today) {
      events.push({
        id: `613xmas_${xmas.date}`,
        name: xmas.name,
        date: xmas.date,
        time: '10am - 4pm',
        venue: 'Carleton University',
        address: '1125 Colonel By Dr, Ottawa',
        url: FLEA_URL,
        category: 'Market',
        free: true,
        description: FLEA_DESC,
      });
    }
  }

  // Sports
  const allSports = [...CHARGE_EVENTS, ...BLACKJACKS_EVENTS, ...SIXTYSEVENS_EVENTS];
  for (const ev of allSports) {
    if (ev.date >= today) {
      events.push({ id: `local_${ev.name.replace(/\s/g, '_')}_${ev.date}`, ...ev, time: ev.time ? fmt24to12(ev.time) : undefined });
    }
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

/** Get the next upcoming 613flea date (for display cards) */
export function getNext613Flea(): { date: string; isChristmas: boolean } | null {
  const today = new Date().toLocaleDateString('en-CA');
  for (const date of FLEA_DATES_2026) {
    if (date >= today) return { date, isChristmas: false };
  }
  for (const xmas of FLEA_CHRISTMAS) {
    if (xmas.date >= today) return { date: xmas.date, isChristmas: true };
  }
  return null;
}
