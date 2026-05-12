import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { routeBadgeStyle } from '../lib/routeColors';

type RouteStop = { stop_id: string; stop_name: string };

type RouteDirection = {
  headsign: string;
  stops: RouteStop[];
  firstBus: string | null;
  lastBus: string | null;
  avgFrequencyMin: number | null;
  tripCount: number;
};

type Props = {
  visible: boolean;
  routeId: string;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
  routeAlertMap?: Record<string, string>;
};

const ROUTE_API = 'https://routeo-backend.vercel.app/api/route';

export default function RouteSheet({
  visible, routeId, onClose, colours, fonts, t, language, routeAlertMap,
}: Props) {
  const insets = useSafeAreaInsets();
  const isLight = colours.bg === '#f0f4f8';

  const [loading, setLoading] = useState(false);
  const [directions, setDirections] = useState<RouteDirection[]>([]);
  const [activeDir, setActiveDir] = useState(0);
  const [error, setError] = useState('');

  const bareId = routeId.split('-')[0];
  const badge = routeBadgeStyle(bareId);
  const disruptionText = routeAlertMap?.[bareId] ?? null;

  useEffect(() => {
    if (!visible || !routeId) return;
    setLoading(true);
    setDirections([]);
    setError('');
    setActiveDir(0);
    fetchWithTimeout(`${ROUTE_API}?id=${encodeURIComponent(bareId)}`, { timeout: 12000 })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const dirs: RouteDirection[] = data.directions || [];
        setDirections(dirs);
        if (dirs.length === 0) setError(t('No data for this route', 'Aucune donnee pour cette ligne'));
      })
      .catch(() => setError(t('Could not load route', 'Impossible de charger la ligne')))
      .finally(() => setLoading(false));
  }, [visible, routeId]);

  const activeDirection = directions[activeDir];

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
          <View style={{ minWidth: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: badge.bg, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: badge.fg }}>{bareId}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>
              {t('Route', 'Ligne')} {bareId}
            </Text>
            {activeDirection?.headsign ? (
              <Text style={{ fontSize: fonts.sm, color: colours.muted }} numberOfLines={1}>
                {activeDirection.headsign}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colours.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

          {/* Disruption banner */}
          {disruptionText && (
            <View style={{ marginHorizontal: 16, marginTop: 14, backgroundColor: '#F9731615', borderRadius: 10, borderWidth: 1, borderColor: '#F9731640', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons name="warning-outline" size={15} color="#F97316" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#F97316' }}>{t('Service disruption', 'Perturbation de service')}</Text>
                <Text style={{ fontSize: 11, color: '#F97316', marginTop: 2 }} numberOfLines={3}>{disruptionText}</Text>
              </View>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={colours.accent} style={{ marginTop: 48 }} />
          ) : error ? (
            <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 32 }}>
              <Ionicons name="bus-outline" size={32} color={colours.muted} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: fonts.md, color: colours.muted, textAlign: 'center' }}>{error}</Text>
            </View>
          ) : (
            <>
              {/* Direction tabs */}
              {directions.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 2, flexWrap: 'wrap' }}>
                  {directions.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setActiveDir(i)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1,
                        borderColor: activeDir === i ? colours.accent : colours.border,
                        backgroundColor: activeDir === i ? colours.accent + '18' : colours.surface,
                      }}
                    >
                      <Ionicons name="arrow-forward" size={12} color={activeDir === i ? colours.accent : colours.muted} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: activeDir === i ? colours.accent : colours.muted }} numberOfLines={1}>
                        {d.headsign || `${t('Direction', 'Direction')} ${i + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Stats row */}
              {activeDirection && (
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, flexWrap: 'wrap' }}>
                  {activeDirection.firstBus && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colours.border }}>
                      <Ionicons name="sunny-outline" size={13} color={colours.muted} />
                      <Text style={{ fontSize: 12, color: colours.text, fontWeight: '600' }}>{activeDirection.firstBus}</Text>
                    </View>
                  )}
                  {activeDirection.lastBus && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colours.border }}>
                      <Ionicons name="moon-outline" size={13} color={colours.muted} />
                      <Text style={{ fontSize: 12, color: colours.text, fontWeight: '600' }}>{activeDirection.lastBus}</Text>
                    </View>
                  )}
                  {activeDirection.avgFrequencyMin && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.accent + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colours.accent + '30' }}>
                      <Ionicons name="time-outline" size={13} color={colours.accent} />
                      <Text style={{ fontSize: 12, color: colours.accent, fontWeight: '700' }}>
                        {t(`Every ${activeDirection.avgFrequencyMin} min`, `Toutes les ${activeDirection.avgFrequencyMin} min`)}
                      </Text>
                    </View>
                  )}
                  {activeDirection.tripCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colours.border }}>
                      <Text style={{ fontSize: 12, color: colours.muted }}>
                        {activeDirection.tripCount} {t('trips/day', 'trajets/jour')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Stop list */}
              {activeDirection && activeDirection.stops.length > 0 && (
                <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
                    {activeDirection.stops.length} {t('stops', 'arrets')}
                  </Text>
                  {activeDirection.stops.map((stop, i) => {
                    const isTerminus = i === 0 || i === activeDirection.stops.length - 1;
                    return (
                      <View key={stop.stop_id} style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: 28 }}>
                        <View style={{ alignItems: 'center', width: 22, marginRight: 10, paddingTop: 3 }}>
                          <View style={{
                            width: isTerminus ? 12 : 8,
                            height: isTerminus ? 12 : 8,
                            borderRadius: isTerminus ? 6 : 4,
                            borderWidth: 2,
                            borderColor: badge.bg,
                            backgroundColor: isTerminus ? badge.bg : 'transparent',
                          }} />
                          {i < activeDirection.stops.length - 1 && (
                            <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: colours.border, marginTop: 2 }} />
                          )}
                        </View>
                        <Text style={{
                          fontSize: isTerminus ? 13 : 12,
                          color: isTerminus ? colours.text : colours.muted,
                          fontWeight: isTerminus ? '700' : '400',
                          paddingBottom: 10, flex: 1,
                        }} numberOfLines={1}>
                          {stop.stop_name}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* OC Transpo full schedule link */}
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://www.octranspo.com/en/our-services/bus-o-train-service/routes/${bareId}`).catch(() => {})}
                style={{ marginHorizontal: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}
              >
                <Ionicons name="calendar-outline" size={16} color={colours.accent} />
                <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600', flex: 1 }}>
                  {t('View full schedule on OC Transpo', "Voir l'horaire complet sur OC Transpo")}
                </Text>
                <Ionicons name="open-outline" size={14} color={colours.muted} />
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
