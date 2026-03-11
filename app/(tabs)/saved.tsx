import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { OC_TRANSPO_API_KEY } from '../../lib/keys';
import stopMap from './stopmap.json';
import tripMap from './tripmap.json';

const TRIP_UPDATES = 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';

const STOP_MAP: { [key: string]: string } = stopMap;
const TRIP_MAP: { [key: string]: string } = tripMap;

const resolveStopId = (id: string) => STOP_MAP[String(parseInt(id))] || id;
const getHeadsign = (tripId: string) => TRIP_MAP[tripId] || '';

type Fav = { id: string; name: string; icon: string };
type Arrival = { id: string; routeId: string; headsign: string; minsAway: number; secsAway: number };
type StopArrivals = { [stopId: string]: Arrival[] };

export default function SavedScreen() {
  const { colours, theme, t, fonts } = useApp();
  const isLight = theme === 'light';

  const cardShadow = isLight ? {
    shadowColor: '#004890',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  } : {};

  const [favs, setFavs] = useState<Fav[]>([]);
  const [arrivals, setArrivals] = useState<StopArrivals>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('routeo_favs').then(val => {
      if (val) setFavs(JSON.parse(val));
      setLoading(false);
    });
  }, []);

  useEffect(() => { if (favs.length > 0) fetchAllArrivals(); }, [favs]);

  useEffect(() => {
    const interval = setInterval(() => { if (favs.length > 0) fetchAllArrivals(); }, 30000);
    return () => clearInterval(interval);
  }, [favs]);

  const fetchAllArrivals = async () => {
    try {
      const resp = await fetch(TRIP_UPDATES, { headers: { 'Ocp-Apim-Subscription-Key': OC_TRANSPO_API_KEY } });
      const data = await resp.json();
      const now = Math.floor(Date.now() / 1000);
      const newArrivals: StopArrivals = {};
      for (const fav of favs) {
        const internalId = resolveStopId(fav.id);
        const results: Arrival[] = [];
        for (const ent of (data.Entity || [])) {
          const tu = ent.TripUpdate;
          if (!tu) continue;
          for (const stu of (tu.StopTimeUpdate || [])) {
            if (String(stu.StopId) !== String(internalId)) continue;
            const arr = stu.Arrival || stu.Departure || {};
            const t2 = parseInt(arr.Time || 0);
            if (!t2) continue;
            const secsAway = t2 - now;
            if (secsAway < -60 || secsAway > 5400) continue;
            const trip = tu.Trip || {};
            const tripId = String(trip.TripId || '');
            results.push({
              id: tripId || String(Math.random()),
              routeId: trip.RouteId || '?',
              headsign: getHeadsign(tripId),
              minsAway: Math.max(0, Math.round(secsAway / 60)),
              secsAway,
            });
          }
        }
        newArrivals[fav.id] = results.sort((a, b) => a.secsAway - b.secsAway).slice(0, 3);
      }
      setArrivals(newArrivals);
      const now2 = new Date();
      setLastUpdated(`${now2.getHours()}:${String(now2.getMinutes()).padStart(2, '0')}`);
    } catch (e) { console.error(e); }
  };

  const removeFav = (id: string) => {
    Alert.alert(t("Remove stop?", "Retirer l'arrêt?"), t('Remove this from your saved stops?', 'Retirer cet arrêt de vos favoris?'), [
      { text: t('Cancel', 'Annuler'), style: 'cancel' },
      { text: t('Remove', 'Retirer'), style: 'destructive', onPress: () => {
        const newFavs = favs.filter(f => f.id !== id);
        setFavs(newFavs);
        AsyncStorage.setItem('routeo_favs', JSON.stringify(newFavs));
      }}
    ]);
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colours.accent} size="large" />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <View>
          <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
            Route<Text style={{ color: colours.accent }}>O</Text>
          </Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
            {t('SAVED STOPS', 'ARRÊTS SAUVEGARDÉS')}
          </Text>
        </View>
        {lastUpdated ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colours.accent }} />
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Updated', 'Mis à jour')} {lastUpdated}</Text>
          </View>
        ) : null}
      </View>

      {favs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Ionicons name="star-outline" size={48} color={colours.muted} style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text, marginBottom: 8 }}>
            {t('No saved stops yet', 'Aucun arrêt sauvegardé')}
          </Text>
          <Text style={{ fontSize: fonts.md, color: colours.muted, textAlign: 'center', lineHeight: 22 }}>
            {t('Search for a stop on the Home tab and tap "+ Save" to add it here.', "Cherchez un arrêt sur l'accueil et appuyez sur \"+ Sauvegarder\".")}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 4 }}>
          <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {favs.length} {t(favs.length > 1 ? 'saved stops' : 'saved stop', favs.length > 1 ? 'arrêts sauvegardés' : 'arrêt sauvegardé')} · {t('live every 30s', 'en direct toutes les 30s')}
          </Text>

          {favs.map(fav => {
            const stopArrivals = arrivals[fav.id] || [];
            return (
              <View key={fav.id} style={[{
                backgroundColor: colours.surface,
                borderWidth: 1,
                borderColor: colours.border,
                borderRadius: 16,
                marginBottom: 16,
                overflow: 'hidden',
              }, cardShadow]}>

                {/* Stop header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="star" size={20} color={colours.accent} />
                    <View>
                      <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{fav.name}</Text>
                      <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>{t('Stop', 'Arrêt')} #{fav.id}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeFav(fav.id)}
                    style={{
                      backgroundColor: colours.red + '15',
                      borderWidth: 1,
                      borderColor: colours.red + '40',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}>
                    <Text style={{ fontSize: fonts.sm, color: colours.red, fontWeight: '600' }}>{t('Remove', 'Retirer')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Arrivals */}
                {stopArrivals.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                      {t('No arrivals in next 90 min', 'Aucune arrivée dans les 90 prochaines min')}
                    </Text>
                  </View>
                ) : (
                  stopArrivals.map(arrival => (
                    <View key={arrival.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colours.border, gap: 12 }}>
                      <View style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: colours.accent + '15',
                        borderWidth: 1,
                        borderColor: colours.accent + '30',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.accent }}>{arrival.routeId}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{t('Route', 'Route')} {arrival.routeId}</Text>
                        <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }} numberOfLines={1}>
                          {arrival.headsign ? `→ ${arrival.headsign}` : `→ ${t('Checking...', 'Vérification...')}`}
                        </Text>
                      </View>
                      <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: arrival.minsAway <= 2 ? colours.red : colours.accent }}>
                        {arrival.minsAway === 0 ? t('Due', 'Imminent') : `${arrival.minsAway}m`}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
