// Shared constants, types, and helpers used by home screen components
// API URLs
export const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';

// Types
export type SavedBoardItem =
  | { type: 'bus_stop';      id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'lrt_station';   id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'otrain' }
  | { type: 'services' }
  | { type: 'discover' }
  | { type: 'external_link'; id: string; label_en: string; label_fr: string; icon: string; accent: string; url: string }
  | { type: 'campus' }
  | { type: 'neighbourhood'; id: string; name_en: string; name_fr: string };

export type ServiceAlert = { id: number; title: string; description: string; link: string; pubDate: string; routes: string[]; category: string; agency?: 'OC' | 'STO' };
export type GhostReportData = { total: number; uniqueDevices: number; confirmedCount: number; netScore: number; likelyGhost: boolean };
export type GhostReports = { [routeId: string]: GhostReportData };

// Alert category colours
export const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#7b5ea7', general: '#004890',
};

export const CAMPUS_LOGOS: Record<string, any> = {
  carleton: require('../assets/schools/carleton.png'),
  uottawa: require('../assets/schools/uottawa.png'),
  algonquin: require('../assets/schools/algonquin.png'),
};

// Time formatters
export const fmtTimeFromDate = (date: Date): string => {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
};
/** @deprecated Use fmtTimeFromDate */
export const fmtTime = fmtTimeFromDate;
export const fmtAbsTime = (minsAway: number): string => fmtTimeFromDate(new Date(Date.now() + minsAway * 60000));


// Stop helpers
export const isStoStop = (id: string): boolean => {
  const num = parseInt(id);
  if (isNaN(num)) return false;
  return num >= 15000 && num <= 59999;
};

export { timeAgo } from './utils';
