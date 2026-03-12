import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ImageBackground, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { Neighbourhood, NEIGHBOURHOODS } from '../lib/neighbourhoodData';
import { SK_SAVED_NEIGHBOURHOODS } from '../lib/storageKeys';

type Props = {
  colours: any;
  fonts: any;
  cardShadow: any;
  events: { name: string; date: string; venue: string; lat?: number; lng?: number }[];
  dealCount: number;
  onPress: (n: Neighbourhood) => void;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function NeighbourhoodSection({ colours, fonts, cardShadow, events, dealCount, onPress }: Props) {
  const { t, language } = useApp();
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SK_SAVED_NEIGHBOURHOODS).then(val => {
      if (val) { try { setSavedIds(JSON.parse(val)); } catch {} }
    });
  }, []);

  const toggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      AsyncStorage.setItem(SK_SAVED_NEIGHBOURHOODS, JSON.stringify(next));
      return next;
    });
  };

  const todayStr = new Date().toLocaleDateString('en-CA');

  // Sort: saved first, then original order
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingRight: 20, gap: 12, paddingBottom: 4 }}>
      {sorted.map(n => {
        const name = language === 'fr' ? n.name_fr : n.name_en;
        const isSaved = savedIds.includes(n.id);
        const evtCount = getEventCount(n);
        return (
          <TouchableOpacity
            key={n.id}
            activeOpacity={0.92}
            onPress={() => onPress(n)}
            style={[{
              width: 170,
              height: 200,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: colours.surface,
              borderWidth: 1,
              borderColor: colours.border,
            }, cardShadow]}
          >
            <ImageBackground
              source={{ uri: n.photoUrl }}
              style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }}
              resizeMode="cover"
            >
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
              {/* Save toggle */}
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); toggleSave(n.id); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={14} color="#fff" />
              </TouchableOpacity>
              {/* Badges */}
              <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 }}>
                {evtCount > 0 && (
                  <View style={{ backgroundColor: n.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{evtCount} {evtCount === 1 ? 'event' : 'events'}</Text>
                  </View>
                )}
              </View>
              {/* Name */}
              <View style={{ padding: 10 }}>
                <Text numberOfLines={2} style={{ color: '#fff', fontSize: fonts.md, fontWeight: '800', lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>
                  {name}
                </Text>
              </View>
            </ImageBackground>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
