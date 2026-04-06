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
import { haversineKm } from '../lib/geo';

const SPORT_COLOURS: Record<string, string> = {
  hockey: '#c8102e',
  football: '#000000',
  basketball: '#1d428a',
  soccer: '#00843d',
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
  onDismiss?: () => void;
};

function nearestNeighbourhood(lat: number, lng: number): Neighbourhood {
  let best = NEIGHBOURHOODS[0];
  let bestDist = Infinity;
  for (const n of NEIGHBOURHOODS) {
    const d = haversineKm(lat, lng, n.lat, n.lng);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

function TonightCard({ colours, fonts, cardShadow, sensGame, events, weather, sportsSchedule, onPressSports, onPressEvents, onPressDeals, onDismiss }: Props) {
  const { t, language } = useApp();
  const [show, setShow] = useState(false);
  const [summary, setSummary] = useState<TonightSummary | null>(null);
  const [focusName, setFocusName] = useState<{ en: string; fr: string } | null>(null);
  const [focus, setFocus] = useState<TonightFocus | null>(null);

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
      const s = buildTonightSummary(sensGame, events, HAPPY_HOUR_VENUES, weather, sportsSchedule || [], focus, language);
      if (s.sports.length > 0 || s.events.count > 0 || s.deals.count > 0) {
        setSummary(s);
        setShow(true);
      }
    });
  }, [sensGame, events, weather, sportsSchedule, focus]);

  const dismiss = () => {
    setShow(false);
    if (onDismiss) {
      onDismiss();
    } else {
      AsyncStorage.setItem(SK_TONIGHT_DISMISSED, String(Date.now()));
    }
  };

  if (!show || !summary) return null;

  const title = focusName
    ? t(`Tonight in ${focusName.en}`, `Ce soir a ${focusName.fr}`)
    : t('Tonight in Ottawa', 'Ce soir a Ottawa');

  // Build a compact subtitle: "3 events · 5 deals" or "2 events"
  const parts: string[] = [];
  if (summary.events.count > 0) parts.push(`${summary.events.count} ${t('events', 'evenements')}`);
  if (summary.deals.count > 0) parts.push(`${summary.deals.count} ${t('deals', 'offres')}`);

  return (
    <View style={[{
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colours.border,
      backgroundColor: colours.surface,
      overflow: 'hidden',
    }, cardShadow]}>

      <View style={{ padding: 14 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: summary.sports.length > 0 ? 12 : 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{title}</Text>
            {weather && (
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                {Math.round(weather.temp)}{'\u00B0'} · {weather.condition}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colours.muted} />
          </TouchableOpacity>
        </View>

        {/* Sports — hero treatment with team color accent */}
        {summary.sports.map((sport, i) => {
          const teamColor = SPORT_COLOURS[sport.icon] || colours.accent;
          return (
            <TouchableOpacity key={i} onPress={onPressSports} activeOpacity={onPressSports ? 0.7 : 1}
              style={{ backgroundColor: teamColor + '0C', borderRadius: 10, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: teamColor }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{sport.label}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{sport.detail}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Events + Deals — combined single line */}
        {parts.length > 0 && (
          <TouchableOpacity
            onPress={summary.events.count > 0 ? onPressEvents : onPressDeals}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ fontSize: fonts.md, color: colours.text }}>
              {parts.join(' · ')}
            </Text>
            {(summary.events.highlights.length > 0 || summary.deals.highlights.length > 0) && (
              <Text style={{ fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>
                {[...summary.events.highlights, ...summary.deals.highlights].slice(0, 2).join(', ')}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default React.memo(TonightCard);
