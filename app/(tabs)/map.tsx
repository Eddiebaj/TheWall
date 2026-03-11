import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, AppState, Keyboard, Linking,
  ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useApp } from '../../context/AppContext';
import { SK_SAVED_ROUTES, SK_FAVS } from '../../lib/storageKeys';

// Error boundary to catch AIRMap native crashes and show a recoverable fallback
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; colours: any; fonts: any; t: (en: string, fr: string) => string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      const { colours, fonts, t } = this.props;
      return (
        <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="map-outline" size={48} color={colours.muted} />
          <Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            {t('Map temporarily unavailable', 'Carte temporairement indisponible')}
          </Text>
          <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 8, textAlign: 'center' }}>
            {t('Something went wrong with the map view', 'Un probleme est survenu avec la carte')}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ marginTop: 20, backgroundColor: colours.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('Tap to retry loading map', 'Appuyez pour reessayer la carte')}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fonts.md }}>{t('Tap to retry', 'Appuyez pour reessayer')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
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
  agency?: 'OC_TRANSPO' | 'STO';
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

// Native-only bus marker — NO children whatsoever to avoid AIRMap insertReactSubview crash
const validCoord = (lat: any, lng: any) => lat != null && lng != null && !isNaN(lat) && !isNaN(lng);

const BusMarker = React.memo(({ bus, onPress }: { bus: Bus; onPress: (b: Bus) => void }) => {
  if (!validCoord(bus.lat, bus.lng)) return null;
  const isSTO = bus.agency === 'STO';
  const label = isLRT(bus.routeId) ? 'LRT' : bus.routeId.split('-')[0];
  return (
    <Marker
      coordinate={{ latitude: bus.lat, longitude: bus.lng }}
      pinColor={isSTO ? '#1abc9c' : '#FF3B30'}
      title={`Route ${label}`}
      description={isSTO ? 'STO Gatineau' : 'OC Transpo'}
      tracksViewChanges={false}
      onPress={() => onPress(bus)}
    />
  );
});

const CATEGORY_COLORS: { [key: string]: string } = {
  'Music': '#6c3fc7', 'Food & Drink': '#1a7a4a', 'Arts & Culture': '#b5450b',
  'Health': '#0077b6', 'Sports': '#004890', 'Business': '#444',
  'Community': '#0077a0', 'Family': '#e67e22', 'Science & Tech': '#2c3e7a',
  'Hobbies': '#7b5ea7',
};
const getCatColor = (cat?: string) => CATEGORY_COLORS[cat || ''] || '#555';

type VenuePin = {
  name: string; address: string; type: ('bar' | 'restaurant' | 'club' | 'fitness')[];
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
  { name: 'The Waverly', address: '339 Elgin St', type: ['bar', 'club'], lat: 45.4161, lng: -75.6881, deals: [
    { days: [5,6], start: '22:00', end: '23:30', description: 'Fri/Sat 10-11:30pm: $5 bar rail' },
  ]},
  { name: 'House of Targ', address: '1077 Bank St', type: ['restaurant', 'bar', 'club'], lat: 45.3946, lng: -75.6831, deals: [
    { days: [2], start: '17:00', end: '23:00', description: 'Tue: Arcade night $12.50' },
    { days: [3], start: '17:00', end: '23:00', description: 'Wed: live music 8pm' },
    { days: [4], start: '17:00', end: '23:00', description: 'Thu: live music 8pm' },
    { days: [5], start: '17:00', end: '01:00', description: 'Fri: live music + events' },
    { days: [6], start: '12:00', end: '01:00', description: 'Sat: live music + events' },
    { days: [0], start: '12:00', end: '23:59', description: 'Sun: Free-Play Sunday' },
  ]},
  { name: 'Level One Game Pub', address: '14 Waller St', type: ['restaurant', 'bar'], lat: 45.4270, lng: -75.6887, deals: [
    { days: [1], start: '18:30', end: '20:00', description: 'Mon: Geek Trivia 6:30-8pm' },
    { days: [2], start: '17:30', end: '20:00', description: 'Tue: TKO fight night 5:30-8pm ($6)' },
    { days: [4], start: '18:00', end: '23:00', description: 'Thu: Reddit board game meetup 6pm' },
    { days: [0], start: '17:00', end: '23:00', description: 'Sun: Magic: The Gathering 5pm ($6)' },
  ]},
  { name: 'Happy Fish', address: '330 Elgin St', type: ['bar', 'club'], lat: 45.4159, lng: -75.6890, deals: [
    { days: [4], start: '21:00', end: '23:59', description: 'Thu: $5 Jagerbombs + $5 draught' },
    { days: [5,6], start: '21:00', end: '23:59', description: 'Fri/Sat: open 9pm-2am' },
  ]},
  { name: 'REFORM Health + Fitness', address: '317 McRae Ave #300', type: ['fitness'], lat: 45.3961, lng: -75.7497, deals: [
    { days: [1,2,3,4,5], start: '06:00', end: '19:00', description: 'Indoor cycling, pilates, high-intensity classes' },
    { days: [6,0], start: '09:00', end: '12:00', description: 'Weekend classes: cycling, pilates, full-body' },
  ]},
  { name: 'Pure Yoga Westboro', address: '279 Richmond Rd', type: ['fitness'], lat: 45.3935, lng: -75.7520, deals: [
    { days: [0,1,2,3,4,5,6], start: '06:00', end: '21:00', description: 'Yoga classes + special workshops' },
  ]},
  { name: 'Pure Yoga Centretown', address: '359 Bank St', type: ['fitness'], lat: 45.4143, lng: -75.6950, deals: [
    { days: [0,1,2,3,4,5,6], start: '06:00', end: '21:00', description: 'Yoga classes + special workshops' },
  ]},
];

const VENUE_COLORS = { food: '#E67E22', happy_hour: '#8E44AD', clubs: '#E91E63', fitness: '#2ECC71' };

const venueTypeColor = (tp: string): string =>
  tp === 'fitness' ? VENUE_COLORS.fitness : tp === 'club' ? VENUE_COLORS.clubs : tp === 'restaurant' ? VENUE_COLORS.food : VENUE_COLORS.happy_hour;

const isTimeInRange = (time: string, start: string, end: string): boolean => {
  if (end < start) return time >= start || time <= end; // crosses midnight
  return time >= start && time <= end;
};

const getVenueTodayDeals = (venue: VenuePin): { active: string[]; upcoming: string[] } => {
  const now = new Date();
  const day = now.getDay();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayDeals = venue.deals.filter(d => d.days.includes(day));
  const active = todayDeals.filter(d => isTimeInRange(timeStr, d.start, d.end)).map(d => d.description);
  const upcoming = todayDeals.filter(d => !isTimeInRange(timeStr, d.start, d.end) && timeStr < d.start).map(d => d.description);
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
    const tmResp = await fetchWithTimeout(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&city=Ottawa&countryCode=CA&size=20&sort=date,asc`);
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
  } catch (_) { console.warn('fetch events failed:', _); }
  _eventsCache = events;
  _eventsCacheTime = Date.now();
  return events;
};


export default function MapScreen() {
  const { colours, theme, t, fonts } = useApp();
  const isLight = theme === 'light';
  const mapRef = useRef<MapView>(null);
  const deepLinkParams = useLocalSearchParams();

  const [buses, setBuses] = useState<Bus[]>([]);
  const [busLoading, setBusLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenuePin | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set(['all']));
  const [highlightRoute, setHighlightRoute] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<{ placeId: string; name: string; address: string }[]>([]);
  const [searchedPlace, setSearchedPlace] = useState<{ placeId: string; name: string; address: string; lat: number; lng: number } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<MapEvent[] | null>(null);
  const [region, setRegion] = useState<Region>(OTTAWA_REGION);
  const [debouncedDelta, setDebouncedDelta] = useState(OTTAWA_REGION.latitudeDelta);
  const appIsActive = useRef(true);
  const [error, setError] = useState('');
  const [markersReady, setMarkersReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [visibleBusCount, setVisibleBusCount] = useState(0);
  const [savedPins, setSavedPins] = useState<SavedPin[]>([]);
  const [savedRouteIds, setSavedRouteIds] = useState<Set<string>>(new Set());
  const [selectedSavedPin, setSelectedSavedPin] = useState<SavedPin | null>(null);
  const [savedLoaded, setSavedLoaded] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback((bus?: Bus, event?: MapEvent, clusterEvs?: MapEvent[], venue?: VenuePin) => {
    setSelectedBus(bus || null); setSelectedEvent(event || null); setSelectedCluster(clusterEvs || null); setSelectedVenue(venue || null);
    if (!bus && !event && !clusterEvs && !venue) {
      // saved pin — selectedSavedPin is already set
    } else {
      setSelectedSavedPin(null);
    }
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [sheetAnim]);

  const hideSheet = () => {
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(() => {
      setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null);
    });
  };

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });

  const fetchBuses = async () => {
    try {
      const resp = await fetchWithTimeout(`${VEHICLES_URL}?t=${Date.now()}`, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      setBuses(data.vehicles || []);
      setError('');
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      setTimeout(() => setMarkersReady(true), 500);    } catch (e) { setError(String(e)); }
    finally { setBusLoading(false); }
  };

  // Pause bus polling when app is backgrounded, resume when foregrounded
  useEffect(() => {
    fetchBuses();
    let interval = setInterval(fetchBuses, 30000);

    const sub = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      appIsActive.current = active;
      if (active) {
        fetchBuses();
        interval = setInterval(fetchBuses, 30000);
      } else {
        clearInterval(interval);
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  // Handle deep-link highlightRoute param
  useEffect(() => {
    if (deepLinkParams.highlightRoute) {
      const routeId = deepLinkParams.highlightRoute as string;
      setHighlightRoute(routeId);
      // Switch filter to bus so the route is visible
      setFilters(new Set(['bus']));
      setSearchText(routeId);
    }
  }, [deepLinkParams.highlightRoute]);

  // Debounce latitudeDelta so clusters don't recompute on every zoom frame
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDelta(region.latitudeDelta), 400);
    return () => clearTimeout(timer);
  }, [region.latitudeDelta]);

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
        const routesRaw = await AsyncStorage.getItem(SK_SAVED_ROUTES);
        if (routesRaw) {
          const routes: SavedRoute[] = JSON.parse(routesRaw);
          for (const r of routes) {
            pins.push({ id: `rf_${r.id}`, name: r.fromLabel, lat: r.fromLat, lng: r.fromLng, kind: 'route_from', routeLabel: `${r.fromLabel} → ${r.toLabel}` });
            pins.push({ id: `rt_${r.id}`, name: r.toLabel, lat: r.toLat, lng: r.toLng, kind: 'route_to', routeLabel: `${r.fromLabel} → ${r.toLabel}` });
          }
        }
        // Saved bus stops — fetch arrivals to get coordinates and route IDs
        const favsRaw = await AsyncStorage.getItem(SK_FAVS);
        if (favsRaw) {
          const favs: SavedFav[] = JSON.parse(favsRaw);
          for (const fav of favs) {
            try {
              const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${fav.id}`);
              if (!resp.ok) throw new Error('HTTP ' + resp.status);
              const data = await resp.json();
              if (data.lat && data.lng) {
                pins.push({ id: `stop_${fav.id}`, name: fav.name, lat: data.lat, lng: data.lng, kind: 'stop' });
              }
              for (const a of (data.arrivals || [])) {
                const base = String(a.routeId).split('-')[0];
                if (base) routeIdSet.add(base);
              }
            } catch (e) { console.warn('fetch stop arrivals failed:', e); }
          }
        }
      } catch (e) { console.warn('load saved pins failed:', e); }
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
  // Zoom level thresholds for bus visibility
  const zoomTooFar = region.latitudeDelta > 0.05;
  const zoomNeighborhood = region.latitudeDelta >= 0.02 && region.latitudeDelta <= 0.05;

  // Viewport bounds for culling (with 10% padding so buses don't pop in/out abruptly)
  const viewBounds = useMemo(() => {
    const pad = region.latitudeDelta * 0.10;
    return {
      minLat: region.latitude - region.latitudeDelta / 2 - pad,
      maxLat: region.latitude + region.latitudeDelta / 2 + pad,
      minLng: region.longitude - region.longitudeDelta / 2 - pad,
      maxLng: region.longitude + region.longitudeDelta / 2 + pad,
    };
  }, [region]);

  const filteredBuses = useMemo(() => {
    // Hide all buses when zoomed out to city-wide view
    if (!showBuses || zoomTooFar) return [];
    let result = buses.filter((b: Bus) => {
      // Viewport culling
      if (b.lat < viewBounds.minLat || b.lat > viewBounds.maxLat ||
          b.lng < viewBounds.minLng || b.lng > viewBounds.maxLng) return false;
      if (hasSaved && !hasAll && !filters.has('bus')) {
        const base = b.routeId.split('-')[0];
        return savedRouteIds.has(base);
      }
      if (!hasAll && filters.has('bus')) return !isLRT(b.routeId);
      return true;
    });
    // Cap at 25 markers when at neighborhood zoom level
    if (zoomNeighborhood && result.length > 25) result = result.slice(0, 25);
    return result;
  }, [showBuses, zoomTooFar, zoomNeighborhood, buses, hasAll, hasSaved, filters, savedRouteIds, viewBounds]);

  // Incrementally render buses in batches of 5 to prevent AIRMap crash on mount
  useEffect(() => {
    if (!mapReady || filteredBuses.length === 0) { setVisibleBusCount(0); return; }
    setVisibleBusCount(0);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      let count = 0;
      intervalId = setInterval(() => {
        count += 5;
        if (count >= filteredBuses.length) {
          setVisibleBusCount(filteredBuses.length);
          if (intervalId) clearInterval(intervalId);
        } else {
          setVisibleBusCount(count);
        }
      }, 100);
    }, 500);
    return () => { clearTimeout(timeoutId); if (intervalId) clearInterval(intervalId); };
  }, [mapReady, filteredBuses.length]);

  const visibleBuses = useMemo(() => filteredBuses.slice(0, visibleBusCount), [filteredBuses, visibleBusCount]);

  const showVenueFilters = hasAll || filters.has('food') || filters.has('happy_hour') || filters.has('clubs') || filters.has('fitness');
  const searchLower = searchText.toLowerCase();
  const venuesTooFar = region.latitudeDelta > 0.08;
  const filteredVenues = useMemo(() => showVenueFilters && !venuesTooFar ? VENUE_PINS.filter(v => {
    if (!venueHasActiveOrUpcomingToday(v)) return false;
    if (searchText && !v.name.toLowerCase().includes(searchLower)) return false;
    if (hasAll) return true;
    if (filters.has('food') && v.type.includes('restaurant')) return true;
    if (filters.has('happy_hour') && v.type.includes('bar')) return true;
    if (filters.has('clubs') && v.type.includes('club')) return true;
    if (filters.has('fitness') && v.type.includes('fitness')) return true;
    return false;
  }) : [], [showVenueFilters, venuesTooFar, searchLower, hasAll, filters]);

  const getVenuePinColor = (v: VenuePin): string => {
    if (v.type.includes('fitness')) return VENUE_COLORS.fitness;
    if (v.type.includes('club')) return VENUE_COLORS.clubs;
    if (v.type.includes('restaurant')) return VENUE_COLORS.food;
    return VENUE_COLORS.happy_hour;
  };

  const centerOnOttawa = () => mapRef.current?.animateToRegion(OTTAWA_REGION, 600);

  // Google Places autocomplete search (proxied through backend)
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) { setPlaceSuggestions([]); return; }
    try {
      const r = await fetch(`https://routeo-backend.vercel.app/api/places?action=autocomplete&input=${encodeURIComponent(query)}&location=45.4215,-75.6972&radius=50000`);
      const data = await r.json();
      if (data.predictions) {
        setPlaceSuggestions(data.predictions.slice(0, 5).map((p: any) => ({
          placeId: p.place_id,
          name: p.structured_formatting?.main_text || p.description,
          address: p.structured_formatting?.secondary_text || '',
        })));
      }
    } catch (_) { setPlaceSuggestions([]); }
  }, []);

  const selectPlace = useCallback(async (suggestion: { placeId: string; name: string; address: string }) => {
    Keyboard.dismiss();
    setPlaceSuggestions([]);
    try {
      const r = await fetch(`https://routeo-backend.vercel.app/api/places?action=details&place_id=${suggestion.placeId}&fields=geometry,name,formatted_address`);
      const data = await r.json();
      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        const place = {
          placeId: suggestion.placeId,
          name: data.result.name || suggestion.name,
          address: data.result.formatted_address || suggestion.address,
          lat, lng,
        };
        setSearchedPlace(place);
        setSearchText(place.name);
        mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
        // Open sheet for this place
        setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null);
        Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
      }
    } catch (_) { console.warn('Place details failed:', _); }
  }, [sheetAnim]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    setPlaceSuggestions([]);
    setSearchedPlace(null);
    hideSheet();
  }, []);

  const hasSheet = selectedBus || selectedEvent || selectedCluster || selectedVenue || selectedSavedPin || searchedPlace;

  // Upcoming events (today + next 2 days) + clustering
  const upcomingDates = useMemo(() => {
    const dates = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.add(d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }));
    }
    return dates;
  }, []);
  const todayEvents = useMemo(() => events.filter(e => upcomingDates.has(e.date)), [events, upcomingDates]);
  const clusters = useMemo(() => clusterEvents(todayEvents, debouncedDelta), [todayEvents, debouncedDelta]);

  return (
    <MapErrorBoundary colours={colours} fonts={fonts} t={t}>
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={OTTAWA_REGION}
        userInterfaceStyle={isLight ? 'light' : 'dark'}
        showsUserLocation
        showsCompass={false}
        onMapReady={() => setMapReady(true)}
        onPress={() => hasSheet && hideSheet()}
        onRegionChangeComplete={(r) => setRegion(r)}
      >
        {/* ALL markers deferred until native map is ready to prevent AIRMap crash */}
        {mapReady && <>
          {/* Bus markers — rendered incrementally */}
          {visibleBuses.map((bus: Bus) => (
            <BusMarker key={bus.id} bus={bus} onPress={openSheet} />
          ))}

          {/* Event cluster markers */}
          {showEvents && (hasAll || filters.has('bus')) && clusters.map((cluster) => {
            if (!validCoord(cluster.lat, cluster.lng)) return null;
            const single = cluster.count === 1 ? cluster.events[0] : null;
            const title = cluster.count > 1
              ? `${cluster.count} events`
              : single!.name;
            const desc = cluster.count > 1
              ? cluster.events.map(e => e.name).slice(0, 3).join(', ')
              : single!.venue;
            return (
              <Marker
                key={cluster.id}
                coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
                pinColor="#026CDF"
                title={title}
                description={desc}
                tracksViewChanges={false}
                onPress={() => cluster.count > 1 ? openSheet(undefined, undefined, cluster.events) : openSheet(undefined, single!)}
              />
            );
          })}

          {/* Saved pin markers */}
          {hasSaved && savedPins.map((pin) => {
            if (!validCoord(pin.lat, pin.lng)) return null;
            const color = pin.kind === 'stop' ? '#e74c3c' : pin.kind === 'route_from' ? '#2ecc71' : '#3498db';
            const kindLabel = pin.kind === 'stop' ? 'Stop' : pin.kind === 'route_from' ? 'Origin' : 'Destination';
            return (
              <Marker
                key={pin.id}
                coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                pinColor={color}
                title={pin.name}
                description={pin.routeLabel ? `${kindLabel} — ${pin.routeLabel}` : kindLabel}
                tracksViewChanges={false}
                onPress={() => {
                  setSelectedSavedPin(pin);
                  openSheet();
                }}
              />
            );
          })}

          {/* Venue markers */}
          {filteredVenues.map((v, i) => {
            if (!validCoord(v.lat, v.lng)) return null;
            const color = getVenuePinColor(v);
            const { active, upcoming } = getVenueTodayDeals(v);
            const hasDeals = active.length > 0 || upcoming.length > 0;
            const dealDesc = active.length > 0 ? active[0] : upcoming.length > 0 ? upcoming[0] : undefined;
            return (
              <Marker
                key={`venue_${i}`}
                coordinate={{ latitude: v.lat, longitude: v.lng }}
                pinColor={color}
                title={hasDeals ? v.name : undefined}
                description={dealDesc}
                tracksViewChanges={false}
                onPress={() => openSheet(undefined, undefined, undefined, v)}
              />
            );
          })}
        </>}

        {/* Searched place marker */}
        {searchedPlace && validCoord(searchedPlace.lat, searchedPlace.lng) && (
          <Marker
            coordinate={{ latitude: searchedPlace.lat, longitude: searchedPlace.lng }}
            pinColor="#3498db"
            title={searchedPlace.name}
            description={searchedPlace.address}
            tracksViewChanges={false}
            onPress={() => {
              setSelectedBus(null); setSelectedEvent(null); setSelectedCluster(null); setSelectedVenue(null); setSelectedSavedPin(null);
              Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
            }}
          />
        )}
      </MapView>

      {/* Header */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
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
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: zoomTooFar ? colours.muted : colours.accent }} />
                <Text style={{ color: zoomTooFar ? colours.muted : colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>
                  {zoomTooFar ? t('Zoom in for buses', 'Zoomez pour les bus') : `${visibleBuses.length} ${t('buses nearby', 'bus proches')}`}
                </Text>
              </View>
            )}
            {lastUpdated ? <Text style={{ fontSize: 10, color: colours.muted }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text> : null}
          </View>
        </View>

        {/* Search bar */}
        <View style={{ marginTop: 10, zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 10, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 10, height: 36 }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              style={{ flex: 1, marginLeft: 8, fontSize: 13, color: colours.text, padding: 0 }}
              placeholder={t('Search anywhere...', 'Rechercher partout...')}
              placeholderTextColor={colours.muted}
              accessibilityLabel={t('Search places on map', 'Rechercher des lieux sur la carte')}
              accessibilityRole="search"
              value={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                if (text.length >= 3) {
                  searchTimer.current = setTimeout(() => searchPlaces(text), 300);
                } else {
                  setPlaceSuggestions([]);
                }
              }}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('Clear search', 'Effacer la recherche')}>
                <Ionicons name="close-circle" size={18} color={colours.muted} />
              </TouchableOpacity>
            )}
          </View>
          {placeSuggestions.length > 0 && (
            <View style={{ backgroundColor: colours.surface, borderRadius: 10, borderWidth: 1, borderColor: colours.border, marginTop: 4, overflow: 'hidden' }}>
              {placeSuggestions.map((s, i) => (
                <TouchableOpacity
                  key={s.placeId}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}
                  onPress={() => selectPlace(s)}>
                  <Ionicons name="location-outline" size={16} color={colours.accent} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colours.text }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{s.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
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
            { key: 'fitness', label_en: 'Fitness', label_fr: 'Fitness', icon: 'barbell-outline' as const, color: VENUE_COLORS.fitness },
            { key: 'saved', label_en: 'Saved', label_fr: 'Favoris', icon: 'heart' as const, color: '#e74c3c' },
          ] as const).map(f => {
            const active = filters.has(f.key);
            const bg = active ? f.color : colours.surface;
            const border = active ? f.color : colours.border;
            return (
              <TouchableOpacity key={f.key}
                style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: bg, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => toggleFilter(f.key)}
                accessibilityRole="button"
                accessibilityLabel={t(`Filter by ${f.label_en}`, `Filtrer par ${f.label_fr}`)}
                accessibilityState={{ selected: active }}>
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
            onPress={() => setShowEvents((v: boolean) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('Toggle today\'s events', 'Afficher les evenements du jour')}
            accessibilityState={{ selected: showEvents }}>
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
        onPress={centerOnOttawa}
        accessibilityRole="button"
        accessibilityLabel={t('Re-center map on Ottawa', 'Recentrer la carte sur Ottawa')}>
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
          {selectedBus && (() => {
            const busLrt = isLRT(selectedBus.routeId);
            const busIsSTO = selectedBus.agency === 'STO';
            const sheetIconBg = busLrt ? getRouteColour(selectedBus.routeId) : busIsSTO ? '#ffffff' : '#FF3B30';
            const sheetIconBorder = busIsSTO ? '#1abc9c' : undefined;
            const sheetIconText = busIsSTO ? '#1abc9c' : '#ffffff';
            const agencyLabel = busIsSTO ? 'STO' : 'OC Transpo';
            return (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: sheetIconBg, alignItems: 'center', justifyContent: 'center', borderWidth: busIsSTO ? 1.5 : 0, borderColor: sheetIconBorder }}>
                    <Text style={{ color: busLrt ? '#ffffff' : sheetIconText, fontSize: 18 }}>{busLrt ? '🚊' : '🚌'}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>
                      {busLrt ? 'O-Train' : `${t('Route', 'Route')} ${selectedBus.routeId.split('-')[0]}`}
                    </Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                      {t('En route', 'En route')} · {selectedBus.progress}% {t('to next stop', 'vers prochain arrêt')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.fromStop}</Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arrêt')} #{selectedBus.toStop}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colours.border, borderRadius: 3 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: busIsSTO ? '#1abc9c' : '#FF3B30', width: `${selectedBus.progress}%` as any }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colours.accent }} />
                    <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '700' }}>
                      {t('Live · Updates every 15s', 'En direct · Mise à jour toutes les 15s')}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: busIsSTO ? '#1abc9c' + '18' : '#FF3B30' + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: busIsSTO ? '#1abc9c' + '40' : '#FF3B30' + '40' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: busIsSTO ? '#1abc9c' : '#FF3B30' }}>{agencyLabel}</Text>
                  </View>
                </View>
              </View>
            </View>
          ); })()}

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
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#2d7a3a' }}>{t('FREE', 'GRATUIT')}</Text>
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
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              {selectedEvent.url && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(selectedEvent.url)}
                  style={{ marginTop: 14, backgroundColor: selectedEvent.source === 'ticketmaster' ? '#026CDF' : getCatColor(selectedEvent.category), borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  accessibilityRole="link"
                  accessibilityLabel={selectedEvent.source === 'ticketmaster' ? t('Get tickets', 'Acheter des billets') : t('View event', 'Voir l\'evenement')}>
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                    {selectedEvent.source === 'ticketmaster' ? t('Get Tickets', 'Acheter des billets') : t('View Event', 'Voir l\'evenement')} →
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
                  {selectedCluster.length} {t('Events Here', 'evenements ici')}
                </Text>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
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
                        <View key={tp} style={{ backgroundColor: venueTypeColor(tp) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: venueTypeColor(tp) + '44' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: venueTypeColor(tp), textTransform: 'capitalize' }}>
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
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#2ecc71', letterSpacing: 1 }}>{t('NOW', 'MAINTENANT')}</Text>
                        </View>
                        {active.map((deal, i) => (
                          <Text key={`a${i}`} style={{ fontSize: fonts.sm, color: colours.text }}>{deal}</Text>
                        ))}
                      </View>
                    )}
                    {upcoming.length > 0 && (
                      <View style={{ gap: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: color, letterSpacing: 1 }}>{t('UPCOMING', 'A VENIR')}</Text>
                        {upcoming.map((deal, i) => (
                          <Text key={`u${i}`} style={{ fontSize: fonts.sm, color: colours.text }}>{deal}</Text>
                        ))}
                      </View>
                    )}
                    {active.length === 0 && upcoming.length === 0 && (
                      <Text style={{ fontSize: fonts.sm, color: colours.muted, fontStyle: 'italic' }}>{t('No deals today', 'Aucune offre aujourd\'hui')}</Text>
                    )}
                  </View>
                  <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                    <Ionicons name="close" size={16} color={colours.text} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedVenue.name + ' ' + selectedVenue.address + ' Ottawa')}`)}
                  style={{ marginTop: 14, backgroundColor: color, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  accessibilityRole="link"
                  accessibilityLabel={t('Open in Maps', 'Ouvrir dans Maps')}>
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                    {t('Open in Maps', 'Ouvrir dans Maps')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Searched place sheet */}
          {searchedPlace && !selectedBus && !selectedEvent && !selectedCluster && !selectedVenue && !selectedSavedPin && (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    <View style={{ backgroundColor: '#3498db22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#3498db44' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#3498db' }}>{t('Place', 'Lieu')}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginBottom: 4 }}>
                    {searchedPlace.name}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{searchedPlace.address}</Text>
                </View>
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={clearSearch} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${searchedPlace.lat},${searchedPlace.lng}&destination_place_id=${searchedPlace.placeId}&travelmode=transit`)}
                style={{ marginTop: 14, backgroundColor: '#3498db', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                accessibilityRole="link"
                accessibilityLabel={t('Get directions', 'Obtenir l\'itineraire')}>
                <Ionicons name="navigate" size={16} color="white" />
                <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                  {t('Directions', 'Itineraire')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
                <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }} onPress={hideSheet} accessibilityRole="button" accessibilityLabel={t('Close panel', 'Fermer le panneau')}>
                  <Ionicons name="close" size={16} color={colours.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selectedSavedPin.lat},${selectedSavedPin.lng}`)}
                style={{ marginTop: 14, backgroundColor: selectedSavedPin.kind === 'stop' ? '#e74c3c' : '#2ecc71', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                accessibilityRole="link"
                accessibilityLabel={t('Open in Maps', 'Ouvrir dans Maps')}>
                <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.md }}>
                  {t('Open in Maps', 'Ouvrir dans Maps')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}
    </View>
    </MapErrorBoundary>
  );
}
