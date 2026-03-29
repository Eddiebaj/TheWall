// Shared constants, types, and helpers used by home screen components
import { CampusConfig } from './campusData';

// ── API URLs ─────────────────────────────────────────────────────
export const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';
export const GAS_URL = 'https://routeo-backend.vercel.app/api/gas';

// ── Types ────────────────────────────────────────────────────────
export type SavedBoardItem =
  | { type: 'bus_stop';      id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'lrt_station';   id: string; name: string; agency?: 'OC' | 'STO' }
  | { type: 'garbage' }
  | { type: 'service_alert' }
  | { type: 'gas_prices' }
  | { type: 'otrain' }
  | { type: 'services' }
  | { type: 'discover' }
  | { type: 'saved_team'; id: string; name: string }
  | { type: 'external_link'; id: string; label_en: string; label_fr: string; icon: string; accent: string; url: string }
  | { type: 'campus' }
  | { type: 'news' }
  | { type: 'neighbourhood'; id: string; name_en: string; name_fr: string };

export type ServiceAlert = { id: number; title: string; description: string; link: string; pubDate: string; routes: string[]; category: string; agency?: 'OC' | 'STO' };
export type GhostReportData = { total: number; uniqueDevices: number; confirmedCount: number; netScore: number; likelyGhost: boolean };
export type GhostReports = { [routeId: string]: GhostReportData };
export type GasReport = {
  id: string;
  station_name: string;
  address: string | null;
  price_per_litre: number;
  fuel_type: string;
  reported_at: string;
  confirmed_count: number;
  disputed_count: number;
};

// ── Alert category colours ───────────────────────────────────────
export const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#7b5ea7', general: '#004890',
};

// ── Team & campus logos ──────────────────────────────────────────
export const TEAM_LOGOS: { [name: string]: any } = {
  'Senators': require('../assets/images/2025-01-ottawa-senators-logo.webp'),
  'REDBLACKS': require('../assets/images/ottawa-redblacks-logo-2023-featured.png'),
  "67's": require("../assets/images/Ottawa_67's_logo.svg.png"),
  'Charge': require('../assets/images/ottawa_charge_logosvg.webp'),
  'Blackjacks': require('../assets/images/Ottawa_Blackjacks_logo.png'),
  'Atlético': require('../assets/images/Atletico_Ottawa_logo.png'),
  'Rapid FC': require('../assets/images/Ottawa_Rapid_FC.png'),
};

export const CAMPUS_LOGOS: Record<string, any> = {
  carleton: require('../assets/schools/carleton.png'),
  uottawa: require('../assets/schools/uottawa.png'),
  algonquin: require('../assets/schools/algonquin.png'),
};

// ── Time formatters ──────────────────────────────────────────────
export const fmtTime = (date: Date): string => {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const fmtAbsTime = (minsAway: number): string => fmtTime(new Date(Date.now() + minsAway * 60000));

// ── Garbage bin info ─────────────────────────────────────────────
export const BIN_INFO: Record<string, { dot: string; color: string; label: string; accepts: string[]; rejects: string[] }> = {
  'garbage':         { dot: '●', color: '#666',    label: 'Garbage',           accepts: ['Food-soiled paper','Non-recyclable plastics','Styrofoam','Broken glass','Diapers'], rejects: ['Recyclables','Hazardous waste','Electronics'] },
  'recycling-blue':  { dot: '●', color: '#1a6fbf', label: 'Blue Bin',          accepts: ['Paper & cardboard','Newspapers','Flyers','Milk cartons','Paper bags'], rejects: ['Plastic bags','Food waste','Styrofoam'] },
  'recycling-black': { dot: '●', color: '#222',    label: 'Black Bin',         accepts: ['Plastic bottles & jugs','Glass bottles & jars','Metal cans','Aluminum foil','Rigid plastics'], rejects: ['Plastic bags','Styrofoam','Paper'] },
  'green-bin':       { dot: '●', color: '#2d7a3a', label: 'Green Bin',         accepts: ['Food scraps','Soiled paper','Coffee grounds & filters','Eggshells','Small houseplants'], rejects: ['Plastic bags','Pet waste','Liquids'] },
  'yard-waste':      { dot: '●', color: '#8b5a00', label: 'Yard Waste',        accepts: ['Leaves','Grass clippings','Branches (under 1.5m)','Garden plants'], rejects: ['Food waste','Soil','Rocks'] },
};

// ── Stop helpers ─────────────────────────────────────────────────
export const isStoStop = (id: string): boolean => {
  const num = parseInt(id);
  if (isNaN(num)) return false;
  return num >= 15000 && num <= 59999;
};

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
