import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar,
  Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { cardShadow as sharedCardShadow } from '../../lib/styles';

const ROUTE_URL = 'https://routeo-backend.vercel.app/api/route';

type Direction = {
  headsign: string;
  tripCount: number;
  stops: string[];
  firstBus: string;
  lastBus: string;
  avgFrequencyMin: number | null;
};

type StopFrequency = {
  currentMin: number | null;
  allDayMin: number | null;
  tripsInWindow: number;
  totalTrips: number;
};

const ROUTE_COLOURS: { [key: string]: string } = {
  '1': '#00A78D', '2': '#7b5ea7', '4': '#004890', '7': '#cc3b2a',
  '8': '#e8a020', '14': '#004890', '16': '#00A78D', '18': '#cc3b2a',
  '19': '#e8a020', '85': '#004890', '86': '#7b5ea7', '87': '#cc3b2a',
  '88': '#00A78D', '91': '#004890', '95': '#cc3b2a', '96': '#e8a020',
  '97': '#7b5ea7', '98': '#004890', '99': '#00A78D',
};

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colours, fonts, t, resolvedTheme } = useApp();
  const router = useRouter();
  const isLight = resolvedTheme === 'light';

  const routeLabel = id || '';
  const routeColor = ROUTE_COLOURS[routeLabel] || colours.accent;

  const [directions, setDirections] = useState<Direction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDir, setSelectedDir] = useState(0);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [stopFreq, setStopFreq] = useState<StopFrequency | null>(null);
  const [stopFreqLoading, setStopFreqLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setSelectedDir(0);
    setLoading(true);
    setError('');
    fetchWithTimeout(`${ROUTE_URL}?id=${id}`)
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        setDirections(data.directions || []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchStopFrequency = async (stopId: string) => {
    if (selectedStop === stopId) { setSelectedStop(null); setStopFreq(null); return; }
    setSelectedStop(stopId);
    setStopFreqLoading(true);
    try {
      const r = await fetchWithTimeout(`${ROUTE_URL}?id=${id}&stop=${stopId}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      setStopFreq(data.frequency || null);
    } catch { setStopFreq(null); }
    setStopFreqLoading(false);
  };

  const openOnMap = () => {
    router.replace({
      pathname: '/(tabs)/map',
      params: { highlightRoute: id },
    } as any);
  };

  const dir = directions[selectedDir];
  const cardShadow = sharedCardShadow;

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colours.bg },
          headerTintColor: colours.text,
          headerTitle: `${t('Route', 'Ligne')} ${routeLabel}`,
          headerTitleStyle: { fontWeight: '700', fontSize: fonts.lg },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/map' as any)} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" size={24} color={colours.text} />
            </TouchableOpacity>
          ),
        }}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={routeColor} />
          <Text style={{ color: colours.muted, fontSize: fonts.md, marginTop: 12 }}>
            {t('Loading route...', 'Chargement de la ligne...')}
          </Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={48} color={colours.muted} />
          <Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            {t('Could not load route', 'Impossible de charger la ligne')}
          </Text>
          <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 8, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : directions.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="bus-outline" size={48} color={colours.muted} />
          <Text style={{ color: colours.text, fontSize: fonts.lg, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            {t('No schedule data', 'Aucune donnee d\'horaire')}
          </Text>
          <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 8, textAlign: 'center' }}>
            {t('Schedule data for this route is not available.', 'Les donnees d\'horaire pour cette ligne ne sont pas disponibles.')}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Route badge + overview */}
          <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 16 }}>
            <View style={{ backgroundColor: routeColor, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="bus" size={28} color="#fff" />
              <Text style={{ color: '#fff', fontSize: fonts.xxl, fontWeight: '700' }}>{routeLabel}</Text>
            </View>
          </View>

          {/* Direction tabs */}
          {directions.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
              {directions.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => { setSelectedDir(i); setSelectedStop(null); setStopFreq(null); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
                    borderWidth: 1,
                    backgroundColor: selectedDir === i ? routeColor + '18' : colours.surface,
                    borderColor: selectedDir === i ? routeColor : colours.border,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: selectedDir === i ? routeColor : colours.muted }} numberOfLines={1}>
                    {d.headsign}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {dir && (
            <View style={{ paddingHorizontal: 20 }}>
              {/* Stats row */}
              <View style={[{ flexDirection: 'row', backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.border, padding: 14, marginBottom: 14, gap: 0 }, cardShadow]}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{t('First Bus', 'Premier bus')}</Text>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginTop: 2 }}>{dir.firstBus}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: colours.border }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{t('Last Bus', 'Dernier bus')}</Text>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginTop: 2 }}>{dir.lastBus}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: colours.border }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{t('Frequency', 'Frequence')}</Text>
                  <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginTop: 2 }}>
                    {dir.avgFrequencyMin ? `${dir.avgFrequencyMin}m` : '—'}
                  </Text>
                </View>
              </View>

              {/* Trip count + direction */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ backgroundColor: routeColor + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: routeColor + '40' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: routeColor }}>
                    {dir.tripCount} {t('trips today', 'trajets aujourd\'hui')}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text, flex: 1 }} numberOfLines={1}>
                  → {dir.headsign}
                </Text>
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={openOnMap}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: routeColor, borderRadius: 12, paddingVertical: 12 }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="map" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: fonts.md }}>{t('Live Map', 'Carte')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.replace({ pathname: '/(tabs)/planner', params: { toLabel: `Route ${routeLabel}` } } as any)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colours.accentAlt, borderRadius: 12, paddingVertical: 12 }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="navigate" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: fonts.md }}>{t('Plan Trip', 'Planifier')}</Text>
                </TouchableOpacity>
              </View>

              {/* Stop list header */}
              <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 8 }}>
                {dir.stops.length} {t('Stops', 'Arrets')}
              </Text>

              {/* Stop list */}
              <View style={[{ backgroundColor: colours.surface, borderRadius: 16, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }, cardShadow]}>
                {dir.stops.map((stopId, i) => {
                  const isFirst = i === 0;
                  const isLast = i === dir.stops.length - 1;
                  const isSelected = selectedStop === stopId;
                  return (
                    <View key={`${stopId}_${i}`}>
                      <TouchableOpacity
                        onPress={() => fetchStopFrequency(stopId)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11,
                          borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border,
                          backgroundColor: isSelected ? routeColor + '08' : 'transparent',
                        }}
                        activeOpacity={0.7}
                      >
                        {/* Timeline dot + line */}
                        <View style={{ width: 24, alignItems: 'center', marginRight: 10 }}>
                          <View style={{
                            width: isFirst || isLast ? 12 : 8, height: isFirst || isLast ? 12 : 8,
                            borderRadius: 6, backgroundColor: isFirst || isLast ? routeColor : colours.border,
                            borderWidth: isFirst || isLast ? 0 : 2, borderColor: routeColor,
                          }} />
                          {!isLast && (
                            <View style={{ width: 2, height: 16, backgroundColor: routeColor + '40', position: 'absolute', top: 14 }} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: isFirst || isLast ? '700' : '500', color: colours.text }}>
                            {t('Stop', 'Arret')} #{stopId}
                          </Text>
                        </View>
                        <Ionicons name={isSelected ? 'chevron-up' : 'chevron-forward'} size={14} color={colours.muted} />
                      </TouchableOpacity>

                      {/* Expanded stop frequency */}
                      {isSelected && (
                        <View style={{ paddingHorizontal: 48, paddingBottom: 10, paddingTop: 2 }}>
                          {stopFreqLoading ? (
                            <ActivityIndicator size="small" color={routeColor} />
                          ) : stopFreq ? (
                            <View style={{ gap: 4 }}>
                              {stopFreq.currentMin != null && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.live }} />
                                  <Text style={{ fontSize: 12, color: colours.text }}>
                                    {t('Current', 'Actuel')}: <Text style={{ fontWeight: '700' }}>{t(`every ${stopFreq.currentMin} min`, `aux ${stopFreq.currentMin} min`)}</Text>
                                    {' '}({stopFreq.tripsInWindow} {t('trips', 'trajets')})
                                  </Text>
                                </View>
                              )}
                              {stopFreq.allDayMin != null && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
                                  <Text style={{ fontSize: 12, color: colours.text }}>
                                    {t('All day', 'Toute la journee')}: <Text style={{ fontWeight: '700' }}>{t(`every ${stopFreq.allDayMin} min`, `aux ${stopFreq.allDayMin} min`)}</Text>
                                    {' '}({stopFreq.totalTrips} {t('trips', 'trajets')})
                                  </Text>
                                </View>
                              )}
                              {stopFreq.currentMin == null && stopFreq.allDayMin == null && (
                                <Text style={{ fontSize: 12, color: colours.muted, fontStyle: 'italic' }}>
                                  {t('No frequency data', 'Aucune donnee de frequence')}
                                </Text>
                              )}
                            </View>
                          ) : (
                            <Text style={{ fontSize: 12, color: colours.muted, fontStyle: 'italic' }}>
                              {t('No data available', 'Aucune donnee disponible')}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
