import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_TONIGHT_DISMISSED } from './storageKeys';

const CTC_LAT = 45.2969;
const CTC_LNG = -75.9270;

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

export type TonightSummary = {
  sports: { label: string; detail: string } | null;
  events: { count: number; highlights: string[] };
  deals: { count: number; highlights: string[] };
  weather: { temp: number; condition: string } | null;
  nearCtcBars: { name: string; deal: string }[];
};

type HappyHourVenue = {
  name: string;
  lat: number;
  lng: number;
  deals: { days: number[]; start: string; end: string; description: string }[];
};

export function buildTonightSummary(
  sensGame: { state: 'live' | 'pre' | 'none'; opponentAbbr?: string; startTime?: string; homeScore?: number; awayScore?: number; period?: string } | null,
  events: { name: string; date: string; time?: string; venue: string }[],
  venues: HappyHourVenue[],
  weather: { temp: number; condition: string } | null,
): TonightSummary {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const mins = now.getMinutes();
  const timeStr = `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const twoHoursLater = `${String(Math.min(hour + 2, 23)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

  // Sports
  let sports: TonightSummary['sports'] = null;
  if (sensGame && sensGame.state !== 'none') {
    if (sensGame.state === 'live') {
      sports = { label: 'Sens Live', detail: `${sensGame.homeScore}-${sensGame.awayScore} ${sensGame.period || ''}`.trim() };
    } else if (sensGame.state === 'pre' && sensGame.startTime) {
      sports = { label: 'Sens Tonight', detail: `vs ${sensGame.opponentAbbr || 'TBD'} @ ${sensGame.startTime}` };
    }
  }

  // Today's events
  const todayStr = now.toLocaleDateString('en-CA');
  const todayEvents = events.filter(e => e.date === todayStr);
  const eventHighlights = todayEvents.slice(0, 3).map(e => e.name);

  // Active/upcoming deals
  const activeVenues = venues.filter(v => {
    return v.deals.some(d => d.days.includes(day) && (
      (timeStr >= d.start && timeStr <= d.end) ||
      (d.start >= timeStr && d.start <= twoHoursLater)
    ));
  });
  const dealHighlights = activeVenues.slice(0, 3).map(v => v.name);

  // Bars near CTC if Sens game
  let nearCtcBars: TonightSummary['nearCtcBars'] = [];
  if (sensGame && sensGame.state !== 'none') {
    nearCtcBars = venues
      .filter(v => haversineKm(v.lat, v.lng, CTC_LAT, CTC_LNG) <= 3)
      .slice(0, 3)
      .map(v => {
        const deal = v.deals.find(d => d.days.includes(day) && timeStr >= d.start && timeStr <= d.end);
        return { name: v.name, deal: deal?.description || '' };
      });
  }

  return {
    sports,
    events: { count: todayEvents.length, highlights: eventHighlights },
    deals: { count: activeVenues.length, highlights: dealHighlights },
    weather,
    nearCtcBars,
  };
}
