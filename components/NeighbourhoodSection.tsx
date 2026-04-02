import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
let LinearGradientModule: typeof import('expo-linear-gradient') | null = null;
try { LinearGradientModule = require('expo-linear-gradient'); } catch {}
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch {}
import React, { useEffect, useState } from 'react';
import {
  Image, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { haversineKm } from '../lib/geo';
import { Neighbourhood, NEIGHBOURHOODS } from '../lib/neighbourhoodData';
import { SK_SAVED_NEIGHBOURHOODS } from '../lib/storageKeys';

const RealLinearGradient = LinearGradientModule?.LinearGradient ?? null;
const GradientOverlay: any = RealLinearGradient ?? (({ colors, ...props }: any) => <View {...props} />);

type TransitScore = {
  neighbourhood_id: string;
  transit_score: number;
  stop_count: number;
  route_count: number;
  avg_frequency: number;
};

type Props = {
  colours: any;
  fonts: any;
  cardShadow: any;
  events: { name: string; date: string; venue: string; lat?: number; lng?: number }[];
  onPress: (n: Neighbourhood) => void;
};

function NeighbourhoodSection({ colours, fonts, cardShadow, events, onPress }: Props) {
  const { t, language } = useApp();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [transitScores, setTransitScores] = useState<Record<string, TransitScore>>({});

  useEffect(() => {
    AsyncStorage.getItem(SK_SAVED_NEIGHBOURHOODS).then(val => {
      if (val) { try { setSavedIds(JSON.parse(val)); } catch (e) { if (__DEV__) console.warn(e); } }
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=transit_scores');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.scores && Array.isArray(data.scores)) {
          const map: Record<string, TransitScore> = {};
          data.scores.forEach((s: TransitScore) => { map[s.neighbourhood_id] = s; });
          setTransitScores(map);
        }
      } catch (e) { if (__DEV__) console.warn('fetch transit scores failed:', e); }
    })();
  }, []);

  const toggleSave = (id: string) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      AsyncStorage.setItem(SK_SAVED_NEIGHBOURHOODS, JSON.stringify(next));
      return next;
    });
  };

  const todayStr = new Date().toLocaleDateString('en-CA');

  const sorted = [...NEIGHBOURHOODS].sort((a, b) => {
    const as = savedIds.includes(a.id) ? 0 : 1;
    const bs = savedIds.includes(b.id) ? 0 : 1;
    return as - bs;
  });

  const getEventCount = (n: Neighbourhood) => {
    return events.filter(e => {
      if (e.date !== todayStr) return false;
      if (e.lat != null && e.lng != null) return haversineKm(e.lat, e.lng, n.lat, n.lng) <= 1.5;
      return false;
    }).length;
  };

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingLeft: 20, paddingRight: 32, paddingBottom: 4 }}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {sorted.map(n => {
          const name = language === 'fr' ? n.name_fr : n.name_en;
          const isSaved = savedIds.includes(n.id);
          const evtCount = getEventCount(n);
          const score = transitScores[n.id];
          return (
            <TouchableOpacity
              key={n.id}
              activeOpacity={0.92}
              onPress={() => onPress(n)}
              style={[{
                width: 160,
                height: 180,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: colours.surface,
                borderWidth: 1,
                borderColor: colours.border,
              }, cardShadow]}
            >
              <Image
                source={{ uri: n.photoUrl }}
                style={{ position: 'absolute', width: '100%', height: '100%' }}
                resizeMode="cover"
              />
              <GradientOverlay
                colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
                style={{ position: 'absolute', width: '100%', height: '100%' }}
                pointerEvents="none"
              />
              {/* Save toggle */}
              <TouchableOpacity
                onPress={() => toggleSave(n.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
              >
                <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={14} color="#fff" />
              </TouchableOpacity>
              {/* Badges */}
              {evtCount > 0 && (
                <View style={{ position: 'absolute', top: 8, left: 8 }} pointerEvents="none">
                  <View style={{ backgroundColor: n.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{evtCount} {evtCount === 1 ? t('event', '\u00e9v\u00e9nement') : t('events', '\u00e9v\u00e9nements')}</Text>
                  </View>
                </View>
              )}
              {/* Transit score badge */}
              {score && (
                <View style={{ position: 'absolute', bottom: 40, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }} pointerEvents="none">
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    {t('Transit Score', 'Score transit')}: {score.transit_score}/10
                  </Text>
                </View>
              )}
              {/* Name */}
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 }} pointerEvents="none">
                <Text numberOfLines={2} style={{ color: '#fff', fontSize: fonts.md, fontWeight: '800', lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>
                  {name}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default React.memo(NeighbourhoodSection);
