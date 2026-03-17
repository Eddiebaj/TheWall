import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { CAMPUSES } from '../lib/campusData';
import { HAPPY_HOUR_VENUES } from '../lib/happyHourData';
import { NEIGHBOURHOODS, Neighbourhood } from '../lib/neighbourhoodData';
import { SK_CAMPUS, SK_TONIGHT_DISMISSED } from '../lib/storageKeys';
import { buildTonightSummary, shouldShowTonightCard, SportEntry, TonightFocus, TonightSummary } from '../lib/tonightHelpers';

const SPORT_ICONS: { [key in SportEntry['icon']]: string } = {
  hockey: 'snow',
  football: 'american-football',
  basketball: 'basketball',
  soccer: 'football',
};

type Props = {
  colours: any;
  fonts: any;
  cardShadow: any;
  sensGame: { state: 'live' | 'pre' | 'none'; opponentAbbr?: string; startTime?: string; homeScore?: number; awayScore?: number; period?: string } | null;
  events: { name: string; date: string; time?: string; venue: string }[];
  weather: { temp: number; condition: string } | null;
  sportsSchedule?: { team: string; games: any[] }[];
  onPressSports?: () => void;
  onPressEvents?: () => void;
  onPressDeals?: () => void;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighbourhood(lat: number, lng: number): Neighbourhood {
  let best = NEIGHBOURHOODS[0];
  let bestDist = Infinity;
  for (const n of NEIGHBOURHOODS) {
    const d = haversineKm(lat, lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

export default function TonightCard({ colours, fonts, cardShadow, sensGame, events, weather, sportsSchedule, onPressSports, onPressEvents, onPressDeals }: Props) {
  const { t, language } = useApp();
  const [show, setShow] = useState(false);
  const [summary, setSummary] = useState<TonightSummary | null>(null);
  const [focusName, setFocusName] = useState<{ en: string; fr: string } | null>(null);
  const [focus, setFocus] = useState<TonightFocus | null>(null);

  // Load campus → resolve nearest neighbourhood
  useEffect(() => {
    AsyncStorage.getItem(SK_CAMPUS).then(val => {
      if (!val) return;
      const campus = CAMPUSES.find(c => c.id === val);
      if (!campus) return;
      const hood = nearestNeighbourhood(campus.lat, campus.lng);
      setFocusName({ en: hood.name_en, fr: hood.name_fr });
      setFocus({ lat: hood.lat, lng: hood.lng });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    shouldShowTonightCard().then(ok => {
      if (!ok) return;
      if (!weather && !sensGame && events.length === 0) return;
      const s = buildTonightSummary(sensGame, events, HAPPY_HOUR_VENUES, weather, sportsSchedule || [], focus);
      if (s.sports.length > 0 || s.events.count > 0 || s.deals.count > 0) {
        setSummary(s);
        setShow(true);
      }
    });
  }, [sensGame, events, weather, sportsSchedule, focus]);

  const dismiss = () => {
    setShow(false);
    AsyncStorage.setItem(SK_TONIGHT_DISMISSED, String(Date.now()));
  };

  if (!show || !summary) return null;

  return (
    <View style={[{
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colours.accent + '40',
      backgroundColor: colours.surface,
      overflow: 'hidden',
    }, cardShadow]}>
      {/* Gradient accent top bar */}
      <View style={{ height: 4, backgroundColor: colours.accent }} />

      <View style={{ padding: 14 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="moon" size={18} color={colours.accent} />
            <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>
              {focusName
                ? t(`Tonight in ${focusName.en}`, `Ce soir a ${focusName.fr}`)
                : t('Tonight in Ottawa', 'Ce soir a Ottawa')}
            </Text>
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={colours.muted} />
          </TouchableOpacity>
        </View>

        {/* Sports — multiple entries */}
        {summary.sports.map((sport, i) => (
          <TouchableOpacity key={i} onPress={onPressSports} activeOpacity={onPressSports ? 0.7 : 1} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ backgroundColor: sport.colour + '18', borderRadius: 8, padding: 6 }}>
              <Ionicons name={SPORT_ICONS[sport.icon] as any} size={14} color={sport.colour} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{sport.label}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{sport.detail}</Text>
            </View>
            {onPressSports && <Ionicons name="chevron-forward" size={14} color={colours.muted} />}
          </TouchableOpacity>
        ))}

        {/* Events */}
        {summary.events.count > 0 && (
          <TouchableOpacity onPress={onPressEvents} activeOpacity={onPressEvents ? 0.7 : 1} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#7b5ea718', borderRadius: 8, padding: 6 }}>
              <Ionicons name="calendar" size={14} color="#7b5ea7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                {summary.events.count} {t('events today', 'evenements aujourd\'hui')}
              </Text>
              {summary.events.highlights.length > 0 && (
                <Text style={{ fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>
                  {summary.events.highlights.join(', ')}
                </Text>
              )}
            </View>
            {onPressEvents && <Ionicons name="chevron-forward" size={14} color={colours.muted} />}
          </TouchableOpacity>
        )}

        {/* Deals */}
        {summary.deals.count > 0 && (
          <TouchableOpacity onPress={onPressDeals} activeOpacity={onPressDeals ? 0.7 : 1} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#00A78D18', borderRadius: 8, padding: 6 }}>
              <Ionicons name="pricetag" size={14} color="#00A78D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>
                {summary.deals.count} {t('active deals', 'offres actives')}
              </Text>
              {summary.deals.highlights.length > 0 && (
                <Text style={{ fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>
                  {summary.deals.highlights.join(', ')}
                </Text>
              )}
            </View>
            {onPressDeals && <Ionicons name="chevron-forward" size={14} color={colours.muted} />}
          </TouchableOpacity>
        )}

        {/* Near venue bars (grouped by venue) */}
        {summary.nearVenueBars.length > 0 && (() => {
          const byVenue: { [key: string]: typeof summary.nearVenueBars } = {};
          for (const b of summary.nearVenueBars) {
            if (!byVenue[b.venueName]) byVenue[b.venueName] = [];
            byVenue[b.venueName].push(b);
          }
          return Object.entries(byVenue).map(([venueName, bars]) => (
            <View key={venueName} style={{ marginTop: 4, marginBottom: 4, backgroundColor: '#cc3b2a08', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#cc3b2a20' }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#cc3b2a', marginBottom: 4 }}>
                {t(`Near ${venueName}`, `Pres du ${venueName}`)}
              </Text>
              {bars.map((b, i) => (
                <Text key={i} style={{ fontSize: fonts.sm, color: colours.muted }}>
                  {b.name}{b.deal ? ` - ${b.deal}` : ''}
                </Text>
              ))}
            </View>
          ));
        })()}

        {/* Weather */}
        {summary.weather && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: summary.sports.length > 0 || summary.events.count > 0 || summary.deals.count > 0 ? 8 : 0 }}>
            <View style={{ backgroundColor: '#e8a02018', borderRadius: 8, padding: 6 }}>
              <Ionicons name="partly-sunny" size={14} color="#e8a020" />
            </View>
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
              {Math.round(summary.weather.temp)}C · {summary.weather.condition}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
