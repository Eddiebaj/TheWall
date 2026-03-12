import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { HAPPY_HOUR_VENUES } from '../lib/happyHourData';
import { SK_TONIGHT_DISMISSED } from '../lib/storageKeys';
import { buildTonightSummary, shouldShowTonightCard, TonightSummary } from '../lib/tonightHelpers';

type Props = {
  colours: any;
  fonts: any;
  cardShadow: any;
  sensGame: { state: 'live' | 'pre' | 'none'; opponentAbbr?: string; startTime?: string; homeScore?: number; awayScore?: number; period?: string } | null;
  events: { name: string; date: string; time?: string; venue: string }[];
  weather: { temp: number; condition: string } | null;
};

export default function TonightCard({ colours, fonts, cardShadow, sensGame, events, weather }: Props) {
  const { t } = useApp();
  const [show, setShow] = useState(false);
  const [summary, setSummary] = useState<TonightSummary | null>(null);

  useEffect(() => {
    shouldShowTonightCard().then(ok => {
      if (!ok) return;
      // Only show once data is loaded
      if (!weather && !sensGame && events.length === 0) return;
      const s = buildTonightSummary(sensGame, events, HAPPY_HOUR_VENUES, weather);
      // Only show if there's something to display
      if (s.sports || s.events.count > 0 || s.deals.count > 0) {
        setSummary(s);
        setShow(true);
      }
    });
  }, [sensGame, events, weather]);

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
            <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{t('Tonight in Ottawa', 'Ce soir a Ottawa')}</Text>
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={colours.muted} />
          </TouchableOpacity>
        </View>

        {/* Sports */}
        {summary.sports && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ backgroundColor: '#cc3b2a18', borderRadius: 8, padding: 6 }}>
              <Ionicons name="american-football" size={14} color="#cc3b2a" />
            </View>
            <View>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{summary.sports.label}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{summary.sports.detail}</Text>
            </View>
          </View>
        )}

        {/* Events */}
        {summary.events.count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
          </View>
        )}

        {/* Deals */}
        {summary.deals.count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
          </View>
        )}

        {/* Near CTC bars (if Sens game) */}
        {summary.nearCtcBars.length > 0 && (
          <View style={{ marginTop: 4, backgroundColor: '#cc3b2a08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#cc3b2a20' }}>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#cc3b2a', marginBottom: 4 }}>
              {t('Near Canadian Tire Centre', 'Pres du Centre Canadian Tire')}
            </Text>
            {summary.nearCtcBars.map((b, i) => (
              <Text key={i} style={{ fontSize: fonts.sm, color: colours.muted }}>
                {b.name}{b.deal ? ` - ${b.deal}` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Weather */}
        {summary.weather && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: summary.sports || summary.events.count > 0 || summary.deals.count > 0 ? 8 : 0 }}>
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
