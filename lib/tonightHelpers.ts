import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_TONIGHT_DISMISSED } from './storageKeys';

const CTC_LAT = 45.2969;
const CTC_LNG = -75.9270;
const TD_PLACE_LAT = 45.3998;
const TD_PLACE_LNG = -75.6844;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function shouldShowTonightCard(): Promise<boolean> {
  const hour = new Date().getHours();
  if (hour < 14 || hour >= 24) return false;
  try {
    const dismissed = await AsyncStorage.getItem(SK_TONIGHT_DISMISSED);
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Date.now() - ts < 24 * 60 * 60 * 1000) return false;
    }
  } catch {}
  return true;
}

export type SportEntry = {
  label: string;
  detail: string;
  icon: 'hockey' | 'football' | 'basketball' | 'soccer';
  colour: string;
};

export type TonightSummary = {
  sports: SportEntry[];
  events: { count: number; highlights: string[] };
  deals: { count: number; highlights: string[] };
  weather: { temp: number; condition: string; icon?: string } | null;
  nearVenueBars: { name: string; deal: string; venueName: string }[];
};

type HappyHourVenue = {
  name: string;
  lat: number;
  lng: number;
  deals: { days: number[]; start: string; end: string; description: string }[];
};

type SensGame = {
  state: 'live' | 'pre' | 'none';
  opponentAbbr?: string;
  startTime?: string;
  homeScore?: number;
  awayScore?: number;
  period?: string;
};

type ScheduleGame = {
  date: string;
  opponent: string;
  opponentAbbr: string;
  homeAway: string;
  status?: string;
};

type TeamSchedule = {
  team: string;
  games: ScheduleGame[];
};

export type TonightFocus = {
  lat: number;
  lng: number;
  radiusKm?: number; // default 1.5
};

export function buildTonightSummary(
  sensGame: SensGame | null,
  events: { name: string; date: string; time?: string; venue: string; lat?: number; lng?: number }[],
  venues: HappyHourVenue[],
  weather: { temp: number; condition: string } | null,
  sportsSchedule: TeamSchedule[],
  focus?: TonightFocus | null,
): TonightSummary {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const mins = now.getMinutes();
  const timeStr = `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const twoHoursLater = `${String(Math.min(hour + 2, 23)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const todayStr = now.toLocaleDateString('en-CA');

  // Sports — Sens (from live game state)
  const sports: SportEntry[] = [];
  if (sensGame && sensGame.state !== 'none') {
    if (sensGame.state === 'live') {
      sports.push({ label: 'Sens Live', detail: `${sensGame.homeScore}-${sensGame.awayScore} ${sensGame.period || ''}`.trim(), icon: 'hockey', colour: '#cc3b2a' });
    } else if (sensGame.state === 'pre' && sensGame.startTime) {
      sports.push({ label: 'Sens Tonight', detail: `vs ${sensGame.opponentAbbr || 'TBD'} @ ${sensGame.startTime}`, icon: 'hockey', colour: '#cc3b2a' });
    }
  }

  // Other teams from schedule data
  const TEAM_CONFIG: { [name: string]: { icon: SportEntry['icon']; colour: string; venue: { lat: number; lng: number } } } = {
    'REDBLACKS': { icon: 'football', colour: '#000000', venue: { lat: TD_PLACE_LAT, lng: TD_PLACE_LNG } },
    "67's": { icon: 'hockey', colour: '#e8a020', venue: { lat: TD_PLACE_LAT, lng: TD_PLACE_LNG } },
    'Charge': { icon: 'hockey', colour: '#7b5ea7', venue: { lat: TD_PLACE_LAT, lng: TD_PLACE_LNG } },
    'Blackjacks': { icon: 'basketball', colour: '#004890', venue: { lat: TD_PLACE_LAT, lng: TD_PLACE_LNG } },
    'Atletico': { icon: 'soccer', colour: '#7b5ea7', venue: { lat: TD_PLACE_LAT, lng: TD_PLACE_LNG } },
    'Rapid FC': { icon: 'soccer', colour: '#00A78D', venue: { lat: TD_PLACE_LAT, lng: TD_PLACE_LNG } },
  };

  for (const ts of sportsSchedule) {
    if (ts.team === 'Senators') continue; // handled above via sensGame
    const config = TEAM_CONFIG[ts.team];
    if (!config) continue;
    const todayGame = ts.games.find(g => {
      const gameDate = new Date(g.date).toLocaleDateString('en-CA');
      return gameDate === todayStr;
    });
    if (todayGame) {
      const gameTime = new Date(todayGame.date).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
      sports.push({
        label: `${ts.team} Tonight`,
        detail: `${todayGame.homeAway} ${todayGame.opponent} @ ${gameTime}`,
        icon: config.icon,
        colour: config.colour,
      });
    }
  }

  // Today's events — bias toward focus neighbourhood if set
  const todayEvents = events.filter(e => e.date === todayStr);
  const focusRadius = focus?.radiusKm ?? 1.5;
  let displayEvents = todayEvents;
  if (focus) {
    const nearby = todayEvents.filter(e =>
      e.lat && e.lng && haversineKm(focus.lat, focus.lng, e.lat, e.lng) <= focusRadius
    );
    if (nearby.length >= 2) displayEvents = nearby;
  }
  const eventHighlights = displayEvents.slice(0, 3).map(e => e.name);

  // Active/upcoming deals — bias toward focus neighbourhood if set
  const isActiveDeal = (v: HappyHourVenue) =>
    v.deals.some(d => d.days.includes(day) && (
      (timeStr >= d.start && timeStr <= d.end) ||
      (d.start >= timeStr && d.start <= twoHoursLater)
    ));
  const activeVenues = venues.filter(isActiveDeal);
  let displayVenues = activeVenues;
  if (focus) {
    const nearby = activeVenues.filter(v =>
      haversineKm(focus.lat, focus.lng, v.lat, v.lng) <= focusRadius
    );
    if (nearby.length >= 2) displayVenues = nearby;
  }
  const dealHighlights = displayVenues.slice(0, 3).map(v => v.name);

  // Bars near game venues (CTC for Sens, TD Place for others)
  const nearVenueBars: TonightSummary['nearVenueBars'] = [];
  const gameVenues: { lat: number; lng: number; name: string }[] = [];

  if (sensGame && sensGame.state !== 'none') {
    gameVenues.push({ lat: CTC_LAT, lng: CTC_LNG, name: 'Canadian Tire Centre' });
  }
  // Check if any other team plays at TD Place tonight
  const tdPlaceTeamPlaying = sports.some(s => s.label !== 'Sens Live' && s.label !== 'Sens Tonight');
  if (tdPlaceTeamPlaying) {
    gameVenues.push({ lat: TD_PLACE_LAT, lng: TD_PLACE_LNG, name: 'TD Place' });
  }

  for (const venue of gameVenues) {
    const nearby = venues
      .filter(v => haversineKm(v.lat, v.lng, venue.lat, venue.lng) <= 3)
      .slice(0, 3)
      .map(v => {
        const deal = v.deals.find(d => d.days.includes(day) && timeStr >= d.start && timeStr <= d.end);
        return { name: v.name, deal: deal?.description || '', venueName: venue.name };
      });
    nearVenueBars.push(...nearby);
  }

  return {
    sports,
    events: { count: displayEvents.length, highlights: eventHighlights },
    deals: { count: displayVenues.length, highlights: dealHighlights },
    weather,
    nearVenueBars,
  };
}
