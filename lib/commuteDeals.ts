import AsyncStorage from '@react-native-async-storage/async-storage';
import { HAPPY_HOUR_VENUES, HappyHourVenue } from './happyHourData';
import { haversineKm } from './geo';
import { supabase } from './supabase';
import { SK_SAVED_BOARD, SK_HOME_ADDRESS, SK_WORK_PLACE, SK_COMMUTE_DEALS_LAST_PUSH, SK_NOTIF_SETTINGS } from './storageKeys';

export type CommuteDeal = {
  venueId: string;
  venueName: string;
  venueAddress: string;
  venueLat: number;
  venueLng: number;
  dealDescription: string;
  nearStopName: string;
  distanceMeters: number;
};

export function isCommuteWindow(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 16 && hour < 19;
}

function parseDealTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isDealActiveNow(deal: { days: number[]; start: string; end: string }): boolean {
  const now = new Date();
  const todayDow = now.getDay();
  if (!deal.days.includes(todayDow)) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const endMins = parseDealTime(deal.end);
  const endWindow = nowMins + 90;
  // Deal ends after now and within 90 min window, or deal ends after our window (still active)
  return nowMins < endMins && endMins <= endWindow + 24 * 60;
}

function isDealEndingWithin90Min(deal: { days: number[]; start: string; end: string }): boolean {
  const now = new Date();
  const todayDow = now.getDay();
  if (!deal.days.includes(todayDow)) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = parseDealTime(deal.start);
  const endMins = parseDealTime(deal.end);
  const endWindow = nowMins + 90;
  // Currently active or starting within 90 min
  return nowMins < endMins && startMins <= endWindow;
}

type Anchor = { lat: number; lng: number; label: string };

export async function getCommuteDeals(lang: 'en' | 'fr' = 'en'): Promise<CommuteDeal[]> {
  const anchors: Anchor[] = [];

  // Load home address
  try {
    const homeRaw = await AsyncStorage.getItem(SK_HOME_ADDRESS);
    if (homeRaw) {
      const home = JSON.parse(homeRaw);
      if (home?.lat && home?.lng) anchors.push({ lat: home.lat, lng: home.lng, label: home.label || 'Home' });
    }
  } catch {}

  // Load work place
  try {
    const workRaw = await AsyncStorage.getItem(SK_WORK_PLACE);
    if (workRaw) {
      const work = JSON.parse(workRaw);
      if (work?.lat && work?.lng) anchors.push({ lat: work.lat, lng: work.lng, label: work.label || 'Work' });
    }
  } catch {}

  // Load board stop IDs, then query Supabase stops table for their coordinates
  try {
    const boardRaw = await AsyncStorage.getItem(SK_SAVED_BOARD);
    if (boardRaw) {
      const board: any[] = JSON.parse(boardRaw);
      const stopIds = board
        .filter(b => b.type === 'bus_stop' || b.type === 'lrt_station')
        .map(b => b.id)
        .slice(0, 10);
      if (stopIds.length > 0) {
        const { data } = await Promise.resolve(
          supabase.from('stops').select('stop_id, stop_lat, stop_lon, stop_name').in('stop_id', stopIds)
        );
        if (data) {
          for (const s of data) {
            if (s.stop_lat && s.stop_lon) {
              anchors.push({ lat: s.stop_lat, lng: s.stop_lon, label: s.stop_name || s.stop_id });
            }
          }
        }
      }
    }
  } catch {}

  if (anchors.length === 0) return [];

  const deals: CommuteDeal[] = [];
  const seen = new Set<string>();

  // Filter HAPPY_HOUR_VENUES with active deals within 400m of any anchor
  for (const venue of HAPPY_HOUR_VENUES) {
    const activeDeals = venue.deals.filter(isDealEndingWithin90Min);
    if (activeDeals.length === 0) continue;

    let nearestAnchor: Anchor | null = null;
    let nearestDist = Infinity;
    for (const anchor of anchors) {
      const distKm = haversineKm(venue.lat, venue.lng, anchor.lat, anchor.lng);
      if (distKm < nearestDist) {
        nearestDist = distKm;
        nearestAnchor = anchor;
      }
    }
    if (!nearestAnchor || nearestDist > 0.4) continue;

    const key = venue.name;
    if (seen.has(key)) continue;
    seen.add(key);

    const deal = activeDeals[0];
    deals.push({
      venueId: venue.name.toLowerCase().replace(/\s+/g, '-'),
      venueName: venue.name,
      venueAddress: venue.address,
      venueLat: venue.lat,
      venueLng: venue.lng,
      dealDescription: lang === 'fr' ? deal.description_fr : deal.description,
      nearStopName: nearestAnchor.label,
      distanceMeters: Math.round(nearestDist * 1000),
    });
  }

  // Also add community deals from Supabase with location matching
  try {
    const todayDow = new Date().getDay();
    const { data: communityDeals } = await Promise.resolve(
      supabase.from('community_deals')
        .select('id, venue_name, deal_text, day_of_week, venue_lat, venue_lng')
        .eq('day_of_week', todayDow)
        .limit(20)
    );
    if (communityDeals) {
      for (const cd of communityDeals) {
        if (!cd.venue_lat || !cd.venue_lng) continue;
        const key = `community_${cd.id}`;
        if (seen.has(key)) continue;

        let nearestAnchor: Anchor | null = null;
        let nearestDist = Infinity;
        for (const anchor of anchors) {
          const distKm = haversineKm(cd.venue_lat, cd.venue_lng, anchor.lat, anchor.lng);
          if (distKm < nearestDist) { nearestDist = distKm; nearestAnchor = anchor; }
        }
        if (!nearestAnchor || nearestDist > 0.4) continue;
        seen.add(key);

        deals.push({
          venueId: `community_${cd.id}`,
          venueName: cd.venue_name,
          venueAddress: '',
          venueLat: cd.venue_lat,
          venueLng: cd.venue_lng,
          dealDescription: cd.deal_text,
          nearStopName: nearestAnchor.label,
          distanceMeters: Math.round(nearestDist * 1000),
        });
      }
    }
  } catch {}

  return deals.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 5);
}

export async function scheduleCommuteNotification(deals: CommuteDeal[], lang: 'en' | 'fr' = 'en'): Promise<void> {
  let Notifications: typeof import('expo-notifications') | null = null;
  try { Notifications = require('expo-notifications'); } catch { return; }
  if (!Notifications) return;

  // Check opt-in
  try {
    const raw = await AsyncStorage.getItem(SK_NOTIF_SETTINGS);
    if (raw) {
      const settings = JSON.parse(raw);
      if (settings.commuteDeals === false) {
        // Cancel existing if opted out
        const existingId = await AsyncStorage.getItem(SK_COMMUTE_DEALS_LAST_PUSH);
        if (existingId) {
          await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
          await AsyncStorage.removeItem(SK_COMMUTE_DEALS_LAST_PUSH);
        }
        return;
      }
    }
  } catch {}

  // Cancel previous scheduled notification
  try {
    const existingId = await AsyncStorage.getItem(SK_COMMUTE_DEALS_LAST_PUSH);
    if (existingId) await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  } catch {}

  if (deals.length === 0) {
    await AsyncStorage.removeItem(SK_COMMUTE_DEALS_LAST_PUSH).catch(() => {});
    return;
  }

  const top = deals[0];
  const body = lang === 'fr'
    ? `${top.venueName} — ${top.dealDescription}, à ${top.distanceMeters}m de ${top.nearStopName}`
    : `${top.venueName} — ${top.dealDescription}, ${top.distanceMeters}m from ${top.nearStopName}`;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: lang === 'fr' ? `Sur votre chemin — ${deals.length} offre${deals.length > 1 ? 's' : ''} sur votre route` : `On your way home — ${deals.length} deal${deals.length > 1 ? 's' : ''} along your route`,
        body,
        data: { type: 'commute_deals' },
        sound: 'default',
      },
      trigger: { hour: 17, minute: 0, repeats: true },
    });
    await AsyncStorage.setItem(SK_COMMUTE_DEALS_LAST_PUSH, id).catch(() => {});
  } catch {}
}
