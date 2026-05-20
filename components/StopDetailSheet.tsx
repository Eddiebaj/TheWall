import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { routeBadgeStyle } from '../lib/routeColors';
import { SK_DEVICE_ID, SK_FAVS } from '../lib/storageKeys';
import { supabase } from '../lib/supabase';

type Arrival = { routeId: string; headsign: string; minsAway: number; source?: string };

type Props = {
  visible: boolean;
  stopId: string;
  stopName: string;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
};

const BACKEND_URL = 'https://routeo-backend.vercel.app/api/arrivals';

export default function StopDetailSheet({ visible, stopId, stopName, onClose, colours, fonts, t }: Props) {
  const insets = useSafeAreaInsets();
  const isLight = colours.bg === '#f0f4f8';

  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [reportedRoutes, setReportedRoutes] = useState<Set<string>>(new Set());
  const [safetyThanks, setSafetyThanks] = useState(false);

  const hour = new Date().getHours();
  const isNight = hour >= 20 || hour < 6;

  useEffect(() => {
    if (!visible || !stopId) return;
    setLoading(true);
    setArrivals([]);
    setReportedRoutes(new Set());
    setSafetyThanks(false);
    fetchWithTimeout(`${BACKEND_URL}?stop=${encodeURIComponent(stopId)}`, { timeout: 10000 })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.arrivals) setArrivals((data.arrivals as Arrival[]).slice(0, 20)); })
      .catch(() => {})
      .finally(() => setLoading(false));
    AsyncStorage.getItem(SK_FAVS)
      .then(val => {
        const favs: { id: string }[] = val ? JSON.parse(val) : [];
        setIsSaved(favs.some(f => f.id === stopId));
      })
      .catch(() => {});
  }, [visible, stopId]);

  const toggleSave = async () => {
    try {
      const val = await AsyncStorage.getItem(SK_FAVS);
      const favs: { id: string; name: string; icon: string }[] = val ? JSON.parse(val) : [];
      if (isSaved) {
        await AsyncStorage.setItem(SK_FAVS, JSON.stringify(favs.filter(f => f.id !== stopId)));
        setIsSaved(false);
      } else {
        await AsyncStorage.setItem(SK_FAVS, JSON.stringify([...favs, { id: stopId, name: stopName, icon: 'bus' }]));
        setIsSaved(true);
      }
    } catch {}
  };

  const reportGhost = async (routeId: string) => {
    if (reportedRoutes.has(routeId)) return;
    setReportedRoutes(prev => new Set([...prev, routeId]));
    try {
      const deviceId = (await AsyncStorage.getItem(SK_DEVICE_ID)) ?? 'unknown';
      fetch('https://routeo-backend.vercel.app/api/community?action=ghost.report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stop_id: stopId, route_id: routeId, report_type: 'not_arrived', notes: '', device_id: deviceId }),
      }).catch(() => {});
    } catch {}
  };

  const reportSafety = async () => {
    if (safetyThanks) return;
    setSafetyThanks(true);
    try {
      const deviceId = (await AsyncStorage.getItem(SK_DEVICE_ID)) ?? 'unknown';
      const timeOfDay = hour >= 20 || hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
      supabase.from('stop_safety_reports').insert({
        stop_id: stopId, stop_code: stopId, device_id: deviceId, time_of_day: timeOfDay,
      }).then(() => {}).catch(() => {});
    } catch {}
  };

  // Group arrivals by base route ID
  const routeGroups = arrivals.reduce<Record<string, Arrival[]>>((acc, a) => {
    const base = a.routeId.split('-')[0];
    if (!acc[base]) acc[base] = [];
    acc[base].push(a);
    return acc;
  }, {});

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

        {/* Header */}
        <View style={{
          paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 14,
          borderBottomWidth: 1, borderBottomColor: colours.border,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#CE112618', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="bus" size={18} color="#CE1126" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }} numberOfLines={1}>{stopName}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Stop', 'Arret')} #{stopId}</Text>
          </View>
          <TouchableOpacity onPress={toggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color={isSaved ? '#e74c3c' : colours.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colours.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

          {loading ? (
            <ActivityIndicator color={colours.accent} style={{ marginTop: 48 }} />
          ) : arrivals.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 32 }}>
              <Ionicons name="bus-outline" size={32} color={colours.muted} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: fonts.md, color: colours.muted, textAlign: 'center' }}>
                {t('No arrivals found', 'Aucune arrivee trouvee')}
              </Text>
            </View>
          ) : (
            <View style={{ paddingTop: 8 }}>
              {Object.entries(routeGroups).map(([baseRoute, routeArrivals], gi) => {
                const badge = routeBadgeStyle(baseRoute);
                const isReported = reportedRoutes.has(baseRoute);
                return (
                  <View key={baseRoute}>
                    {gi > 0 && <View style={{ height: 1, backgroundColor: colours.border, marginHorizontal: 16 }} />}
                    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <View style={{ minWidth: 36, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: badge.bg, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: badge.fg }}>{baseRoute}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colours.text, flex: 1 }} numberOfLines={1}>
                          {routeArrivals[0]?.headsign || ''}
                        </Text>
                        <TouchableOpacity
                          onPress={() => reportGhost(baseRoute)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={{ fontSize: 11, color: isReported ? colours.accent : colours.muted, fontWeight: isReported ? '600' : '400' }}>
                            {isReported ? t('Reported', 'Signale') : t('Ghost?', 'Fantome?')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {routeArrivals.slice(0, 5).map((a, i) => {
                          const mins = a.minsAway;
                          const bg = mins <= 0 ? '#00C07A18' : mins < 10 ? '#F59E0B18' : colours.surface;
                          const fg = mins <= 0 ? '#00C07A' : mins < 10 ? '#D97706' : colours.muted;
                          return (
                            <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: bg, borderWidth: 1, borderColor: colours.border }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: fg }}>
                                {mins <= 0 ? t('Now', 'Maintenant') : `${mins} min`}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* OC Transpo schedule link */}
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://www.octranspo.com/en/our-services/transit-service/schedules-and-maps/?agency=OC&route=undefined&stop=${stopId}`).catch(() => {})}
            style={{ marginHorizontal: 16, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}
          >
            <Ionicons name="calendar-outline" size={16} color={colours.accent} />
            <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600', flex: 1 }}>
              {t('View full schedule on OC Transpo', "Voir l'horaire complet sur OC Transpo")}
            </Text>
            <Ionicons name="open-outline" size={14} color={colours.muted} />
          </TouchableOpacity>

          {/* Save Commute */}
          <TouchableOpacity
            onPress={() => {
              const nextArrival = arrivals[0];
              if (!nextArrival) return;
              const now = new Date();
              const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
              supabase.from('saved_commutes').insert({
                route_id: nextArrival.routeId.split('-')[0],
                stop_id: stopId,
                departure_time: time,
                days_active: ['mon','tue','wed','thu','fri'],
                is_active: true,
              }).then(() => alert(t('Commute saved! We\'ll alert you if your bus is late.', 'Trajet sauvegardé! Nous vous alerterons si votre bus est en retard.')))
                .catch(() => {});
            }}
            style={{ marginHorizontal: 16, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#00C07A40', backgroundColor: '#00C07A08' }}
          >
            <Ionicons name="alarm-outline" size={16} color="#00C07A" />
            <Text style={{ fontSize: 13, color: '#00C07A', fontWeight: '600' }}>
              {t('Save as commute stop', 'Sauvegarder comme arrêt de trajet')}
            </Text>
          </TouchableOpacity>

          {/* Safety button  -  night only */}
          {isNight && (
            <TouchableOpacity
              onPress={reportSafety}
              style={{ marginHorizontal: 16, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B40', backgroundColor: '#F59E0B08' }}
            >
              <Ionicons name="warning-outline" size={16} color="#D97706" />
              <Text style={{ fontSize: 13, color: '#D97706', fontWeight: '600' }}>
                {safetyThanks
                  ? t('Thanks for letting us know', 'Merci de nous avoir informe')
                  : t('Feel unsafe at this stop?', 'Vous sentez-vous en insecurite ici?')}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
