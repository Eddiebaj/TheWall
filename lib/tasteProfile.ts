import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_TASTE_PROFILE } from './storageKeys';

export type TasteProfile = {
  categories: Record<string, number>;
  venues: Record<string, number>;
  neighbourhoods: Record<string, number>;
};

export const EMPTY_PROFILE: TasteProfile = { categories: {}, venues: {}, neighbourhoods: {} };

export const TASTE_POINTS = {
  rsvp: 3,
  venue_follow: 5,
  card_tap: 1,
  group_join: 4,
} as const;

export function addPoints(
  profile: TasteProfile,
  field: keyof TasteProfile,
  key: string,
  pts: number,
): TasteProfile {
  return {
    ...profile,
    [field]: { ...profile[field], [key]: (profile[field][key] ?? 0) + pts },
  };
}

export function topKey(record: Record<string, number>): string | null {
  const entries = Object.entries(record);
  if (entries.length === 0) return null;
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

export async function loadProfile(): Promise<TasteProfile> {
  try {
    const raw = await AsyncStorage.getItem(SK_TASTE_PROFILE);
    if (raw) return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {}
  return EMPTY_PROFILE;
}

export async function saveProfile(profile: TasteProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(SK_TASTE_PROFILE, JSON.stringify(profile));
  } catch {}
}

/** Load profile, add points, and persist — fire-and-forget. */
export function addAndSave(field: keyof TasteProfile, key: string, pts: number): void {
  loadProfile().then(p => saveProfile(addPoints(p, field, key, pts))).catch(() => {});
}
