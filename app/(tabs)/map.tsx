import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Linking,
  ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useApp } from '../../context/AppContext';

import { TICKETMASTER_API_KEY } from '../../lib/keys';

const VEHICLES_URL    = 'https://routeo-backend.vercel.app/api/vehicles';
const BACKEND_URL     = 'https://routeo-backend.vercel.app/api/arrivals';

type SavedRoute = { id: string; fromLabel: string; toLabel: string; fromLat: number; fromLng: number; toLat: number; toLng: number };
type SavedFav = { id: string; name: string; icon: string };
type SavedPin = { id: string; name: string; lat: number; lng: number; kind: 'stop' | 'route_from' | 'route_to'; routeLabel?: string };

const OTTAWA_REGION: Region = {
  latitude: 45.4215, longitude: -75.6972,
  latitudeDelta: 0.08, longitudeDelta: 0.08,
};

type Bus = {
  id: string; routeId: string; lat: number; lng: number;
  fromStop: string; toStop: string; progress: number;
};

type MapEvent = {
  id: string; name: string; date: string; time?: string;
  venue: string; address?: string; url: string;
  image?: string; category?: string; free?: boolean;
  source: 'ticketmaster';
  lat?: number; lng?: number;
};

const ROUTE_COLOURS: { [key: string]: string } = {
  '1': '#00A78D', '2': '#7b5ea7', '4': '#004890', '7': '#cc3b2a',
  '8': '#e8a020', '14': '#004890', '16': '#00A78D', '18': '#cc3b2a',
  '19': '#e8a020', '85': '#004890', '86': '#7b5ea7', '87': '#cc3b2a',
  '88': '#00A78D', '91': '#004890', '95': '#cc3b2a', '96': '#e8a020',
  '97': '#7b5ea7', '98': '#004890', '99': '#00A78D',
};
const getRouteColour = (routeId: string) => ROUTE_COLOURS[routeId.split('-')[0]] || '#004890';
const isLRT = (routeId: string) => {
  const base = routeId.split('-')[0].toLowerCase();
  return base === '1' || base === '2' || base === 'o1' || base === 'o2' ||
         base === 'confederation' || base === 'trillium' || routeId.toLowerCase().includes('lrt');
};

const CATEGORY_COLORS: { [key: string]: string } = {
  'Music': '#6c3fc7', 'Food & Drink': '#1a7a4a', 'Arts & Culture': '#b5450b',
  'Health': '#0077b6', 'Sports': '#004890', 'Business': '#444',
  'Community': '#0077a0', 'Family': '#e67e22', 'Science & Tech': '#2c3e7a',
  'Hobbies': '#7b5ea7',
};
const getCatColor = (cat?: string) => CATEGORY_COLORS[cat || ''] || '#555';

type VenuePin = {
  name: string; address: string; type: ('bar' | 'restaurant' | 'club')[];
  lat: number; lng: number;
  deals: { days: number[]; start: string; end: string; description: string }[];
};

const VENUE_PINS: VenuePin[] = [
  { name: "Joey's Lansdowne", address: '825 Exhibition Way', type: ['bar', 'restaurant'], lat: 45.3998, lng: -75.6844, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Happy Hour daily 3-6pm' },
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm-close specials' },
    { days: [2], start: '15:00', end: '23:59', description: 'Up to 50% off wine Tuesdays' },
  ]},
  { name: "Joey's Rideau", address: '50 Rideau St', type: ['bar', 'restaurant'], lat: 45.4260, lng: -75.6916, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '18:00', description: 'Happy Hour daily 3-6pm' },
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm-close specials' },
    { days: [2], start: '15:00', end: '23:59', description: 'Up to 50% off wine Tuesdays' },
  ]},
  { name: 'Local Public Eatery', address: '825 Exhibition Way', type: ['bar', 'restaurant'], lat: 45.3999, lng: -75.6840, deals: [
    { days: [1,2,3,4,5], start: '14:00', end: '17:00', description: 'Mon-Fri 2-5pm happy hour' },
    { days: [6], start: '10:00', end: '14:00', description: 'Sat drinks only 10am-2pm' },
    { days: [0,1,2], start: '21:00', end: '23:59', description: 'Sun-Wed 9pm-close specials' },
    { days: [3,4,5,6], start: '22:00', end: '23:59', description: 'Thu-Sat 10pm-close specials' },
  ]},
  { name: 'Pour Boy', address: '495 Somerset St W', type: ['bar', 'restaurant'], lat: 45.4138, lng: -75.7005, deals: [
    { days: [1], start: '11:00', end: '23:59', description: '25% off wings Monday' },
    { days: [2], start: '19:00', end: '23:59', description: 'Trivia night Tuesday' },
    { days: [3], start: '19:00', end: '23:59', description: 'Open Mic Wednesday' },
    { days: [4], start: '19:00', end: '23:59', description: 'Comedy night Thursday' },
    { days: [5], start: '11:00', end: '23:59', description: '25% off fish & chips + Blingo Friday' },
  ]},
  { name: 'Rabbit Hole', address: '208 Sparks St', type: ['bar', 'restaurant', 'club'], lat: 45.4212, lng: -75.7010, deals: [
    { days: [2], start: '16:00', end: '18:00', description: 'Tue HH 4-6pm' },
    { days: [2], start: '17:00', end: '23:59', description: 'Half off wine + half off pizzas 5pm-late Tue' },
    { days: [3], start: '16:00', end: '18:00', description: 'Wed HH 4-6pm + half price oysters' },
    { days: [4], start: '16:00', end: '18:00', description: 'Thu HH 4-6pm' },
    { days: [5,6], start: '21:00', end: '23:59', description: 'Fri/Sat Live DJ' },
  ]},
  { name: 'Whalesbone', address: '430 Bank St', type: ['restaurant', 'bar'], lat: 45.4122, lng: -75.6939, deals: [
    { days: [0], start: '17:00', end: '23:59', description: 'Oysters ~$2 each Sunday nights' },
  ]},
  { name: "Lieutenant's Pump", address: '361 Elgin St', type: ['restaurant', 'bar', 'club'], lat: 45.4153, lng: -75.6878, deals: [
    { days: [3], start: '11:00', end: '23:59', description: 'Wednesday wing day - half price' },
    { days: [1,2,3,4,5], start: '11:00', end: '14:00', description: 'Lunch combo: pint + supper $5' },
  ]},
  { name: 'The Standard', address: '360 Elgin St', type: ['restaurant', 'bar', 'club'], lat: 45.4153, lng: -75.6884, deals: [
    { days: [0,1,2,3,4,5,6], start: '17:00', end: '19:00', description: 'Happy Hour 7 days a week 5-7pm' },
  ]},
  { name: 'Heart and Crown ByWard', address: '67 Clarence St', type: ['restaurant', 'bar', 'club'], lat: 45.4290, lng: -75.6935, deals: [
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: $5 house draught' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: half price wine' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: $5 rail cocktails' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $5 quarts and craft cans' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $6 bloody caesars' },
  ]},
  { name: 'Heart and Crown Preston', address: '361 Preston St', type: ['restaurant', 'bar', 'club'], lat: 45.4011, lng: -75.7096, deals: [
    { days: [1], start: '11:00', end: '23:59', description: 'Mon: $5 house draught' },
    { days: [2], start: '11:00', end: '23:59', description: 'Tue: half price wine' },
    { days: [3], start: '11:00', end: '23:59', description: 'Wed: $5 rail cocktails' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: $5 quarts and craft cans' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $6 bloody caesars' },
  ]},
  { name: 'Union Local 613', address: '315 Somerset St W', type: ['restaurant', 'bar'], lat: 45.4161, lng: -75.6949, deals: [
    { days: [1,2,3,4,5], start: '16:00', end: '17:00', description: 'Mon-Fri 4-5pm: half price wine, $6 draft, cheap cocktails' },
  ]},
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
  ]},
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
  ]},
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
  ]},
  { name: 'Royal Oak Wellington', address: '1217 Wellington St W', type: ['restaurant', 'bar'], lat: 45.4002, lng: -75.7313, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts' },
  ]},
  { name: 'Royal Oak Bank', address: '188 Bank St', type: ['restaurant', 'bar'], lat: 45.4178, lng: -75.6986, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts' },
  ]},
  { name: 'Royal Oak Slater', address: '180 Kent St', type: ['restaurant', 'bar'], lat: 45.4180, lng: -75.7017, deals: [
    { days: [0,1,2,3,4], start: '21:00', end: '23:59', description: 'Sun-Thu 9pm: $5.50 domestics/wine/rails + half price apps' },
    { days: [1], start: '17:00', end: '23:59', description: 'Mon: 50% off wings after 5pm' },
    { days: [3], start: '17:00', end: '23:59', description: 'Wed: 50% off wings after 5pm + trivia 7pm' },
    { days: [4], start: '11:00', end: '23:59', description: 'Thu: 50% off wine bottles' },
    { days: [5], start: '11:00', end: '23:59', description: 'Fri: $3 off fish & chips' },
    { days: [6], start: '11:00', end: '23:59', description: 'Sat: $5.95 bar rails' },
    { days: [0], start: '11:00', end: '23:59', description: 'Sun: $7.95 caesars + craft draughts' },
  ]},
  { name: "Jack Astor's Lansdowne", address: '425 Marche Way', type: ['restaurant', 'bar'], lat: 45.4008, lng: -75.6830, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue' },
  ]},
  { name: "Jack Astor's Hunt Club", address: '310 W Hunt Club Rd', type: ['restaurant', 'bar'], lat: 45.3391, lng: -75.7129, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue' },
  ]},
  { name: "Jack Astor's Kanata", address: '125 Roland Michener Dr', type: ['restaurant', 'bar'], lat: 45.3085, lng: -75.9131, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Happy hour daily 2-5pm' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close specials' },
    { days: [1,2], start: '11:00', end: '23:59', description: 'Half price wine bottles Mon & Tue' },
  ]},
  { name: 'Shore Club', address: '11 Colonel By Dr', type: ['restaurant', 'bar'], lat: 45.4250, lng: -75.6927, deals: [
    { days: [0,1,2,3,4,5,6], start: '15:00', end: '17:00', description: 'Daily 3-5pm: half price oysters, $2 prawns, $3.50 sliders, $9 Heineken, $12 wine' },
  ]},
  { name: 'Drip House', address: '692 Somerset St W', type: ['bar'], lat: 45.4110, lng: -75.7065, deals: [
    { days: [3,4,5], start: '16:30', end: '18:30', description: 'Wed-Fri 4:30-6:30pm: $9 cocktails, wine, and appetizers' },
  ]},
  { name: 'Baton Rouge Downtown', address: '360 Albert St', type: ['restaurant', 'bar'], lat: 45.4181, lng: -75.7038, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails' },
  ]},
  { name: 'Baton Rouge Hunt Club', address: '270 W Hunt Club Rd', type: ['restaurant', 'bar'], lat: 45.3396, lng: -75.7110, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails' },
  ]},
  { name: 'Baton Rouge Kanata', address: '790 Earl Grey Dr', type: ['restaurant', 'bar'], lat: 45.3106, lng: -75.9095, deals: [
    { days: [1,2,3,4,5], start: '15:00', end: '18:00', description: 'Mon-Fri 3-6pm: $7 pints, $7 wine, $10 cocktails' },
  ]},
  { name: 'Craft Beer Market', address: '975 Bank St', type: ['bar'], lat: 45.3987, lng: -75.6856, deals: [
    { days: [0,1,2,3,4,5,6], start: '14:00', end: '17:00', description: 'Daily 2-5pm HH: discounted craft beer, wine, cocktails' },
    { days: [0,1,2,3,4,5,6], start: '21:00', end: '23:59', description: '9pm-close HH' },
    { days: [0], start: '11:00', end: '23:59', description: 'All-day specials Sundays' },
  ]},
];

const VENUE_COLORS = { food: '#E67E22', happy_hour: '#8E44AD', clubs: '#E91E63' };

const getVenueTodayDeals = (venue: VenuePin): { active: string[]; upcoming: string[] } => {
  const now = new Date();
  const day = now.getDay();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayDeals = venue.deals.filter(d => d.days.includes(day));
  const active = todayDeals.filter(d => timeStr >= d.start && timeStr <= d.end).map(d => d.description);
  const upcoming = todayDeals.filter(d => timeStr < d.start).map(d => d.description);
  return { active, upcoming };
};

const venueHasActiveOrUpcomingToday = (venue: VenuePin): boolean => {
  const { active, upcoming } = getVenueTodayDeals(venue);
  return active.length > 0 || upcoming.length > 0;
};

// ── Today filter ─────────────────────────────────────────────────
const getTodayStr = () => {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD in ET
};

// ── Grid-based clustering ─────────────────────────────────────────
type Cluster = {
  id: string;
  lat: number; lng: number;
  events: MapEvent[];
  count: number;
};

const clusterEvents = (events: MapEvent[], delta: number): Cluster[] => {
  // Grid cell size scales with zoom level
  const gridSize = delta * 0.15;
  const cells: { [key: string]: MapEvent[] } = {};
  for (const ev of events) {
    if (!ev.lat || !ev.lng) continue;
    const cellX = Math.floor(ev.lng / gridSize);
    const cellY = Math.floor(ev.lat / gridSize);
    const key = `${cellX}_${cellY}`;
    if (!cells[key]) cells[key] = [];
    cells[key].push(ev);
  }
  return Object.entries(cells).map(([key, evs]) => {
    const avgLat = evs.reduce((s, e) => s + (e.lat || 0), 0) / evs.length;
    const avgLng = evs.reduce((s, e) => s + (e.lng || 0), 0) / evs.length;
    return { id: 'cluster_' + key, lat: avgLat, lng: avgLng, events: evs, count: evs.length };
  });
};

// ── Module-level event cache (persists for app session) ──────────
let _eventsCache: MapEvent[] | null = null;
let _eventsCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const fetchAllEvents = async (): Promise<MapEvent[]> => {
  if (_eventsCache && Date.now() - _eventsCacheTime < CACHE_TTL) return _eventsCache;

  let events: MapEvent[] = [];
  try {
    const tmResp = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&city=Ottawa&countryCode=CA&size=20&sort=date,asc`);
    if (tmResp.ok) {
      const d = await tmResp.json();
      const tmEvents: MapEvent[] = (d._embedded?.events || []).map((e: any) => ({
        id: 'tm_' + e.id,
        name: e.name,
        date: e.dates?.start?.localDate || '',
        time: e.dates?.start?.localTime?.slice(0, 5) || '',
        venue: e._embedded?.venues?.[0]?.name || '',
        address: e._embedded?.venues?.[0]?.address?.line1 || '',
        url: e.url,
        image: e.images?.find((img: any) => img.ratio === '16_9' && img.width > 500)?.url || e.images?.[0]?.url,
        category: e.classifications?.[0]?.segment?.name,
        source: 'ticketmaster' as const,
        lat: parseFloat(e._embedded?.venues?.[0]?.location?.latitude),
        lng: parseFloat(e._embedded?.venues?.[0]?.location?.longitude),
      })).filter((e: MapEvent) => e.lat && e.lng && !isNaN(e.lat) && !isNaN(e.lng));
      events.push(...tmEvents);
    }
  } catch (_) {}
  _eventsCache = events;
  _eventsCacheTime = Date.now();
  return events;
};


export default function MapScreen() {
  const { colours, theme, t, fonts } = useApp();
  const isLight = theme === 'light';
  const mapRef = useRef<MapView>(null);

  const [buses, setBuses] = useState<Bus[]>([]);
  const [busLoading, setBusLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenuePin | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set(['all']));
  const [searchText, setSearchText] = useState('');
  const [showEvents, setShowEvents] = useState(true);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<MapEvent[] | null>(null);
  const [region, setRegion] = useState<Region>(OTTAWA_REGION);
  const [error, setError] = useState('');
  const [markersReady, setMarkersReady] = useState(false);
  const [savedPins, setSavedPins] = useState<SavedPin[]>([]);
  const [savedRouteIds, setSavedRouteIds] = useState<Set<string>>(new Set());
  const [selectedSavedPin, setSelectedSavedPin] = useState<SavedPin | null>(null);
  const [savedLoaded, setSavedLoaded] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  const openSheet = (bus?: Bus, event?: MapEvent, clusterEvs?: MapEvent[], venue?: VenuePin) => {
    setSelectedBus(bus || null); setSelectedEvent(event || null); setSelectedCluster(clusterEvs || null); setSelectedVenue(venue || null);
    if (!bus && !event && !clusterEvs && !venue) {
      // saved pin — selectedSavedPin is already set
    } else {
      setSelectedSavedPin(null);
    }
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const hideSheet = () => {
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
      setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null);
    });
  };

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });

  const fetchBuses = async () => {
    try {
      const resp = await fetch(`${VEHICLES_URL}?t=${Date.now()}`, { headers: { 'Accept': 'application/json' } });
      const data = await resp.json();
      setBuses((data.vehicles || []).slice(0, 30));
      setError('');
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      setTimeout(() => setMarkersReady(true), 500);    } catch (e) { setError(String(e)); }
    finally { setBusLoading(false); }
  };

  useEffect(() => {
    fetchBuses();
    const interval = setInterval(fetchBuses, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showEvents) return;
    const t = setTimeout(() => {
      setEventsLoading(true);
      fetchAllEvents().then(evs => { setEvents(evs); setEventsLoading(false); });
    }, 5000); // wait for buses to render first
    return () => clearTimeout(t);
  }, [showEvents]);

  // Load saved stops, routes, places when "saved" filter first activated
  useEffect(() => {
    if (savedLoaded) return;
    const load = async () => {
      const pins: SavedPin[] = [];
      const routeIdSet = new Set<string>();
      try {
        // Saved routes (trip planner)
        const routesRaw = await AsyncStorage.getItem('routeo_saved_routes');
        if (routesRaw) {
          const routes: SavedRoute[] = JSON.parse(routesRaw);
          for (const r of routes) {
            pins.push({ id: `rf_${r.id}`, name: r.fromLabel, lat: r.fromLat, lng: r.fromLng, kind: 'route_from', routeLabel: `${r.fromLabel} → ${r.toLabel}` });
            pins.push({ id: `rt_${r.id}`, name: r.toLabel, lat: r.toLat, lng: r.toLng, kind: 'route_to', routeLabel: `${r.fromLabel} → ${r.toLabel}` });
          }
        }
        // Saved bus stops — fetch arrivals to get coordinates and route IDs
        const favsRaw = await AsyncStorage.getItem('routeo_favs');
        if (favsRaw) {
          const favs: SavedFav[] = JSON.parse(favsRaw);
          for (const fav of favs) {
            try {
              const resp = await fetch(`${BACKEND_URL}?stop=${fav.id}`);
              const data = await resp.json();
              if (data.lat && data.lng) {
                pins.push({ id: `stop_${fav.id}`, name: fav.name, lat: data.lat, lng: data.lng, kind: 'stop' });
              }
              for (const a of (data.arrivals || [])) {
                const base = String(a.routeId).split('-')[0];
                if (base) routeIdSet.add(base);
              }
            } catch {}
          }
        }
      } catch {}
      setSavedPins(pins);
      setSavedRouteIds(routeIdSet);
      setSavedLoaded(true);
    };
    load();
  }, [savedLoaded]);

  const toggleFilter = (key: string) => {
    setFilters(prev => {
      if (key === 'all') {
        return prev.has('all') ? new Set<string>() : new Set(['all']);
      }
      const next = new Set(prev);
      next.delete('all');
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return new Set(['all']);
      return next;
    });
  };

  const hasAll = filters.has('all');
  const hasSaved = filters.has('saved');
  const showBuses = hasAll || filters.has('bus') || hasSaved;
  const filteredBuses = showBuses ? buses.filter((b: Bus) => {
    if (hasSaved && !hasAll && !filters.has('bus')) {
      // Only show buses on saved routes
      const base = b.routeId.split('-')[0];
      return savedRouteIds.has(base);
    }
    if (!hasAll && filters.has('bus')) return !isLRT(b.routeId);
    return true;
  }) : [];

  const showVenueFilters = hasAll || filters.has('food') || filters.has('happy_hour') || filters.has('clubs');
  const searchLower = searchText.toLowerCase();
  const filteredVenues = showVenueFilters ? VENUE_PINS.filter(v => {
    if (!venueHasActiveOrUpcomingToday(v)) return false;
    if (searchText && !v.name.toLowerCase().includes(searchLower)) return false;
    if (hasAll) return true;
    if (filters.has('food') && v.type.includes('restaurant')) return true;
    if (filters.has('happy_hour') && v.type.includes('bar')) return true;
    if (filters.has('clubs') && v.type.includes('club')) return true;
    return false;
  }) : [];

  const getVenuePinColor = (v: VenuePin): string => {
    if (v.type.includes('club')) return VENUE_COLORS.clubs;
    if (v.type.includes('restaurant')) return VENUE_COLORS.food;
    return VENUE_COLORS.happy_hour;
  };

  const centerOnOttawa = () => mapRef.current?.animateToRegion(OTTAWA_REGION, 600);

  const hasSheet = selectedBus || selectedEvent || selectedCluster || selectedVenue || selectedSavedPin;

  // Upcoming events (today + next 2 days) + clustering
  const getUpcomingDates = () => {
    const dates = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.add(d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
    }
    return dates;
  };
  const upcomingDates = getUpcomingDates();
  const todayEvents = events.filter(e => upcomingDates.has(e.date));
  const clusters = clusterEvents(todayEvents, region.latitudeDelta);

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={OTTAWA_REGION}
        userInterfaceStyle={isLight ? 'light' : 'dark'}
        showsUserLocation
        showsCompass={false}
        onPress={() => hasSheet && hideSheet()}
        onRegionChangeComplete={(r) => setRegion(r)}
      >
        {/* Bus markers */}
        {filteredBuses.map((bus: Bus) => {
          const colour = getRouteColour(bus.routeId);
          const lrt = isLRT(bus.routeId);
          return (
            <Marker key={bus.id} coordinate={{ latitude: bus.lat, longitude: bus.lng }}
              onPress={() => openSheet(bus)} anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}>
              <View style={{
                backgroundColor: colour, borderRadius: lrt ? 8 : 12,
                paddingHorizontal: lrt ? 7 : 6, paddingVertical: lrt ? 4 : 3,
                borderWidth: 2, borderColor: 'white',
                shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 }, elevation: 4,
                minWidth: 28, alignItems: 'center',
              }}>
                <Text style={{ color: 'white', fontSize: lrt ? 11 : 10, fontWeight: '800' }}>
                  {lrt ? '🚊' : bus.routeId.split('-')[0]}
                </Text>
              </View>
            </Marker>
          );
        })}

        {/* Event cluster markers */}
        {showEvents && (hasAll || filters.has('bus')) && clusters.map((cluster) => {
          const single = cluster.count === 1 ? cluster.events[0] : null;
          const color = single
            ? (single.source === 'ticketmaster' ? '#026CDF' : getCatColor(single.category))
            : '#026CDF';
          return (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
              onPress={() => cluster.count > 1 ? openSheet(undefined, undefined, cluster.events) : openSheet(undefined, single!)}
              anchor={{ x: 0.5, y: 1.0 }}
              tracksViewChanges={false}
            >
              <View style={{ alignItems: 'center' }}>
                {cluster.count > 1 ? (
                  // Cluster bubble
                  <View style={{
                    backgroundColor: '#026CDF',
                    borderRadius: 20, width: 40, height: 40,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2.5, borderColor: 'white',
                    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 }, elevation: 5,
                  }}>
                    <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }}>{cluster.count}</Text>
                  </View>
                ) : region.latitudeDelta > 0.04 ? (
                  // Zoomed out — simple dot pin, no card
                  <View style={{
                    width: 14, height: 14, borderRadius: 7,
                    backgroundColor: color,
                    borderWidth: 2, borderColor: 'white',
                    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 }, elevation: 4,
                  }} />
                ) : (
                  // Zoomed in — mini card with tail
                  <View style={{ alignItems: 'center' }}>
                    <View style={{
                      backgroundColor: color, borderRadius: 10,
                      paddingHorizontal: 8, paddingVertical: 5,
                      maxWidth: 140, minWidth: 60,
                      borderWidth: 2, borderColor: 'white',
                      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 }, elevation: 5,
                    }}>
                      <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }} numberOfLines={2}>
                        {single!.name.length > 30 ? single!.name.slice(0, 28) + '…' : single!.name}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 8, marginTop: 1 }}>
                        {single!.source === 'ticketmaster' ? '🎟' : '📅'} Today
                      </Text>
                    </View>
                    <View style={{
                      width: 0, height: 0,
                      borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
                      borderLeftColor: 'transparent', borderRightColor: 'transparent',
                      borderTopColor: color,
                    }} />
                  </View>
                )}
              </View>
            </Marker>
          );
        })}

        {/* Saved pin markers — only when Saved filter is explicitly on */}
        {hasSaved && savedPins.map((pin) => {
          const pinColor = pin.kind === 'stop' ? '#e74c3c' : pin.kind === 'route_from' ? '#2ecc71' : '#3498db';
          const pinIcon = pin.kind === 'stop' ? 'bus' : pin.kind === 'route_from' ? 'flag' : 'location';
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              onPress={() => {
                setSelectedSavedPin(pin);
                openSheet();
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={{
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: pinColor, borderWidth: 2.5, borderColor: 'white',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 }, elevation: 4,
              }}>
                <Ionicons name={pinIcon as any} size={14} color="white" />
              </View>
            </Marker>
          );
        })}

        {/* Venue markers */}
        {filteredVenues.map((v, i) => {
          const color = getVenuePinColor(v);
          const { active } = getVenueTodayDeals(v);
          const isActive = active.length > 0;
          return (
            <Marker
              key={`venue_${i}`}
              coordinate={{ latitude: v.lat, longitude: v.lng }}
              onPress={() => openSheet(undefined, undefined, undefined, v)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={{
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: color, borderWidth: 2.5, borderColor: 'white',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 }, elevation: 4,
              }}>
                <Ionicons
                  name={v.type.includes('club') ? 'musical-notes-outline' : v.type.includes('restaurant') ? 'restaurant-outline' : 'wine-outline'}
                  size={13} color="white"
                />
                {isActive && (
                  <View style={{
                    position: 'absolute', top: -2, right: -2,
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: '#2ecc71', borderWidth: 1.5, borderColor: 'white',
                  }} />
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Header */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
        backgroundColor: isLight ? 'rgba(240,244,248,0.92)' : 'rgba(15,20,30,0.92)',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
              Route<Text style={{ color: colours.accent }}>O</Text>
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
              {t('LIVE MAP', 'CARTE EN DIRECT')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {busLoading ? <ActivityIndicator color={colours.accent} size="small" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
                <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>
                  {filteredBuses.length} {t('buses', 'bus')}
                </Text>
              </View>
            )}
            {lastUpdated ? <Text style={{ fontSize: 10, color: colours.muted }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text> : null}
          </View>
        </View>

        {/* Search bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: colours.surface, borderRadius: 10, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 10, height: 36 }}>
          <Ionicons name="search-outline" size={16} color={colours.muted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontSize: 13, color: colours.text, padding: 0 }}
            placeholder={t('Search venues...', 'Rechercher...')}
            placeholderTextColor={colours.muted}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={colours.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {([
            { key: 'all', label_en: 'All', label_fr: 'Tous', icon: 'apps-outline' as const, color: colours.accent },
            { key: 'bus', label_en: 'Bus', label_fr: 'Bus', icon: 'bus-outline' as const, color: colours.accent },
            { key: 'food', label_en: 'Food', label_fr: 'Restos', icon: 'restaurant-outline' as const, color: VENUE_COLORS.food },
            { key: 'happy_hour', label_en: 'Happy Hour', label_fr: 'Happy Hour', icon: 'beer-outline' as const, color: VENUE_COLORS.happy_hour },
            { key: 'clubs', label_en: 'Clubs', label_fr: 'Clubs', icon: 'musical-notes-outline' as const, color: VENUE_COLORS.clubs },
            { key: 'saved', label_en: 'Saved', label_fr: 'Favoris', icon: 'heart' as const, color: '#e74c3c' },
          ] as const).map(f => {
            const active = filters.has(f.key);
            const bg = active ? f.color : colours.surface;
            const border = active ? f.color : colours.border;
            return (
              <TouchableOpacity key={f.key}
                style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: bg, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => toggleFilter(f.key)}>
                <Ionicons name={f.icon} size={12} color={active ? 'white' : colours.muted} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'white' : colours.muted }}>
                  {t(f.label_en, f.label_fr)}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Events toggle */}
          <TouchableOpacity
            style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: showEvents ? '#026CDF' : colours.surface, borderWidth: 1, borderColor: showEvents ? '#026CDF' : colours.border }}
            onPress={() => setShowEvents((v: boolean) => !v)}>
            {eventsLoading
              ? <ActivityIndicator size="small" color="white" />
              : <Ionicons name="ticket-outline" size={13} color={showEvents ? 'white' : colours.muted} />}
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: showEvents ? 'white' : colours.muted }}>
              {t('Today', 'Aujourd\'hui')} {!eventsLoading && todayEvents.length > 0 ? `(${todayEvents.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={{ fontSize: 11, color: 'red', marginTop: 6 }}>{error}</Text> : null}
      </View>

      {/* Re-center button */}
      <TouchableOpacity
        style={{
          position: 'absolute', bottom: hasSheet ? 300 : 110, right: 20,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 }, elevation: 4,
        }}
        onPress={centerOnOttawa}>
        <Ionicons name="locate" size={20} color={colours.accent} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      {hasSheet && (
        <Animated.View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          transform: [{ translateY: sheetTranslate }],
          backgroundColor: colours.surface,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderWidth: 1, borderColor: colours.border,
          paddingBottom: 34,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 }, elevation: 10,
        }}>
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border }} />
          </View>

          {/* Bus sheet */}
          {selectedBus && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: getRouteColour(selectedBus.routeId), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 18 }}>{isLRT(selectedBus.routeId) ? '🚊' : '🚌'}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>
                      {isLRT(selectedBus.routeId) ? 'O-Train' : `${t('Route', 'Route')} ${selectedBus.routeId.split('-')[0]}`}
                    </Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                      {t('En route', 'En route')} · {selectedBus.progress}% {t('to next stop', 'vers prochain arrêt')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.fromStop}</Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.toStop}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colours.border, borderRadius: 3 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: getRouteColour(selectedBus.routeId), width: `${selectedBus.progress}%` as any }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colours.accent }} />
                  <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '700' }}>
                    {t('Live · Updates every 15s', 'En direct · Mise à jour toutes les 15s')}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Event sheet */}
          {selectedEvent && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  {/* Source + category badge */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: (selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category)) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category)) + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category) }}>
                        {selectedEvent.source === 'ticketmaster' ? 'Ticketmaster' : (selectedEvent.category || 'Community')}
                      </Text>
                    </View>
                    {selectedEvent.free && (
                      <View style={{ backgroundColor: '#2d7a3a22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#2d7a3a44' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#2d7a3a' }}>FREE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }} numberOfLines={3}>
                    {selectedEvent.name}
                  </Text>
                  {selectedEvent.date && (
                    <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginBottom: 2 }}>
                      {new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {selectedEvent.time ? ` · ${selectedEvent.time}` : ''}
                    </Text>
                  )}
                  {selectedEvent.venue ? <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{selectedEvent.venue}</Text> : null}
                  {selectedEvent.address ? <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{selectedEvent.address}</Text> : null}
                </View>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              {selectedEvent.url && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(selectedEvent.url)}
                  style={{ marginTop: 14, backgroundColor: selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category), borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                    {selectedEvent.source === 'ticketmaster' ? 'Get Tickets →' : 'View Event →'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Cluster sheet — list of events in this area */}
          {selectedCluster && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>
                  {selectedCluster.length} Events Here
                </Text>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {selectedCluster.map((ev) => (
                  <TouchableOpacity key={ev.id} onPress={() => ev.url && Linking.openURL(ev.url)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border, gap: 10 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ev.source === 'ticketmaster' ? '#026CDF' : getCatColor(ev.category), flexShrink: 0 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>{ev.name}</Text>
                      <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{ev.venue}{ev.time ? ` · ${ev.time}` : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colours.muted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Venue sheet */}
          {selectedVenue && (() => {
            const { active, upcoming } = getVenueTodayDeals(selectedVenue);
            const color = getVenuePinColor(selectedVenue);
            return (
              <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      {selectedVenue.type.map(tp => (
                        <View key={tp} style={{ backgroundColor: (tp === 'club' ? VENUE_COLORS.clubs : tp === 'restaurant' ? VENUE_COLORS.food : VENUE_COLORS.happy_hour) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (tp === 'club' ? VENUE_COLORS.clubs : tp === 'restaurant' ? VENUE_COLORS.food : VENUE_COLORS.happy_hour) + '44' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: tp === 'club' ? VENUE_COLORS.clubs : tp === 'restaurant' ? VENUE_COLORS.food : VENUE_COLORS.happy_hour, textTransform: 'capitalize' }}>
                            {tp}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }}>
                      {selectedVenue.name}
                    </Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 6 }}>{selectedVenue.address}</Text>
                    {active.length > 0 && (
                      <View style={{ gap: 4, marginBottom: upcoming.length > 0 ? 8 : 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ecc71' }} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#2ecc71', letterSpacing: 1 }}>NOW</Text>
                        </View>
                        {active.map((deal, i) => (
                          <Text key={`a${i}`} style={{ fontSize: fonts.sm, color: colours.text }}>{deal}</Text>
                        ))}
                      </View>
                    )}
                    {upcoming.length > 0 && (
                      <View style={{ gap: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: color, letterSpacing: 1 }}>UPCOMING</Text>
                        {upcoming.map((deal, i) => (
                          <Text key={`u${i}`} style={{ fontSize: fonts.sm, color: colours.text }}>{deal}</Text>
                        ))}
                      </View>
                    )}
                    {active.length === 0 && upcoming.length === 0 && (
                      <Text style={{ fontSize: fonts.sm, color: colours.muted, fontStyle: 'italic' }}>No deals today</Text>
                    )}
                  </View>
                  <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                    <Ionicons name="close" size={16} color={colours.text} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedVenue.name + ' ' + selectedVenue.address + ' Ottawa')}`)}
                  style={{ marginTop: 14, backgroundColor: color, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                    {t('Open in Maps', 'Ouvrir dans Maps')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Saved pin sheet */}
          {selectedSavedPin && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: (selectedSavedPin.kind === 'stop' ? '#e74c3c' : '#2ecc71') + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: (selectedSavedPin.kind === 'stop' ? '#e74c3c' : '#2ecc71') + '44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: selectedSavedPin.kind === 'stop' ? '#e74c3c' : '#2ecc71' }}>
                        {selectedSavedPin.kind === 'stop' ? t('Saved Stop', 'Arret favori') : t('Saved Route', 'Trajet favori')}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }}>
                    {selectedSavedPin.name}
                  </Text>
                  {selectedSavedPin.routeLabel && (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{selectedSavedPin.routeLabel}</Text>
                  )}
                  {selectedSavedPin.kind === 'stop' && (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                      {t('Stop', 'Arret')} #{selectedSavedPin.id.replace('stop_', '')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selectedSavedPin.lat},${selectedSavedPin.lng}`)}
                style={{ marginTop: 14, backgroundColor: selectedSavedPin.kind === 'stop' ? '#e74c3c' : '#2ecc71', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                  {t('Open in Maps', 'Ouvrir dans Maps')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}
