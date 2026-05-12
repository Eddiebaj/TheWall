import AsyncStorage from '@react-native-async-storage/async-storage';
import { haversineKm } from './geo';
import { SK_TONIGHT_DISMISSED } from './storageKeys';

const CTC_LAT = 45.2969;
const CTC_LNG = -75.9270;
const TD_PLACE_LAT = 45.3998;
const TD_PLACE_LNG = -75.6844;

export async function shouldShowTonightCard(): Promise<boolean> {
  const hour = new Date().getHours();
  if (hour < 14) return false;
  try {
    const dismissed = await AsyncStorage.getItem(SK_TONIGHT_DISMISSED);
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (!isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) return false;
    }
  } catch (e) { if (__DEV__) console.warn(e); }
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
  focus?: TonightFocus | null,
): TonightSummary {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const mins = now.getMinutes();
  const timeStr = `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const twoHoursLater = hour + 2 >= 24 ? '23:59' : `${String(hour + 2).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
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
