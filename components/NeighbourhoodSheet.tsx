import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, ScrollView,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { HAPPY_HOUR_VENUES } from '../lib/happyHourData';
import { Neighbourhood } from '../lib/neighbourhoodData';
import { NewsArticle, SOURCE_COLOURS, timeAgo } from '../lib/newsData';

type Props = {
  visible: boolean;
  neighbourhood: Neighbourhood | null;
  onClose: () => void;
  colours: any;
  fonts: any;
  events: { id: string; name: string; date: string; time?: string; venue: string; url: string; lat?: number; lng?: number }[];
  newsArticles: NewsArticle[];
};

type Tab = 'places' | 'events' | 'deals' | 'transit' | 'news';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TABS: { id: Tab; icon: string; label_en: string; label_fr: string }[] = [
  { id: 'places', icon: 'location', label_en: 'Places', label_fr: 'Lieux' },
  { id: 'events', icon: 'calendar', label_en: 'Events', label_fr: 'Evenements' },
  { id: 'deals', icon: 'pricetag', label_en: 'Deals', label_fr: 'Aubaines' },
  { id: 'transit', icon: 'bus', label_en: 'Transit', label_fr: 'Transport' },
  { id: 'news', icon: 'newspaper', label_en: 'News', label_fr: 'Nouvelles' },
];

export default function NeighbourhoodSheet({ visible, neighbourhood, onClose, colours, fonts, events, newsArticles }: Props) {
  const { t, language } = useApp();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('places');
  const [places, setPlaces] = useState<any[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [stops, setStops] = useState<any[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  const n = neighbourhood;

  useEffect(() => {
    if (!visible || !n) return;
    setActiveTab('places');
    setPlaces([]);
    setStops([]);
  }, [visible, n?.id]);

  useEffect(() => {
    if (!visible || !n) return;
    if (activeTab === 'places' && places.length === 0) fetchPlaces();
    if (activeTab === 'transit' && stops.length === 0) fetchStops();
  }, [activeTab, visible]);

  const fetchPlaces = async () => {
    if (!n) return;
    setPlacesLoading(true);
    try {
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?lat=${n.lat}&lng=${n.lng}&type=point_of_interest&radius=800`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      setPlaces((data.results || []).slice(0, 15));
    } catch (e) { if (__DEV__) console.warn('fetch neighbourhood places failed:', e); }
    setPlacesLoading(false);
  };

  const fetchStops = async () => {
    if (!n) return;
    setStopsLoading(true);
    try {
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/arrivals?lat=${n.lat}&lng=${n.lng}&radius=500`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      setStops((data.stops || []).slice(0, 10));
    } catch (e) { if (__DEV__) console.warn('fetch neighbourhood stops failed:', e); }
    setStopsLoading(false);
  };

  if (!n) return null;

  const name = language === 'fr' ? n.name_fr : n.name_en;
  const description = language === 'fr' ? n.description_fr : n.description_en;

  // Filter events within 1.5km
  const nearbyEvents = events.filter(e => {
    if (e.lat != null && e.lng != null) return haversineKm(e.lat, e.lng, n.lat, n.lng) <= 1.5;
    return false;
  });

  // Filter deals within 1.5km
  const now = new Date();
  const day = now.getDay();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nearbyDeals = HAPPY_HOUR_VENUES
    .filter(v => haversineKm(v.lat, v.lng, n.lat, n.lng) <= 1.5)
    .map(v => {
      const todayDeals = v.deals.filter(d => d.days.includes(day));
      const activeDeals = todayDeals.filter(d => timeStr >= d.start && timeStr <= d.end);
      const upcomingDeals = todayDeals.filter(d => timeStr < d.start);
      return { ...v, todayDeals, activeDeals, upcomingDeals, isActive: activeDeals.length > 0 };
    })
    .filter(v => v.todayDeals.length > 0);

  // Filter news by neighbourhood keywords
  const filteredNews = newsArticles.filter(a => {
    const text = (a.title + ' ' + a.description).toLowerCase();
    return n.keywords.some(kw => text.includes(kw));
  });

  const renderContent = () => {
    switch (activeTab) {
      case 'places':
        if (placesLoading) return <ActivityIndicator color={colours.accent} style={{ marginTop: 20 }} />;
        if (places.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No places found', 'Aucun lieu trouve')}</Text>;
        return places.map((p: any, i: number) => (
          <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }} onPress={() => { if (p.place_id) Linking.openURL(`https://www.google.com/maps/place/?q=place_id:${p.place_id}`); }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: n.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location" size={16} color={n.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }} numberOfLines={1}>{p.name}</Text>
              {p.vicinity && <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{p.vicinity}</Text>}
            </View>
            {p.rating && <Text style={{ fontSize: fonts.sm, color: colours.muted, fontWeight: '600' }}>{p.rating}</Text>}
          </TouchableOpacity>
        ));

      case 'events':
        if (nearbyEvents.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No upcoming events nearby', 'Aucun evenement a proximite')}</Text>;
        return nearbyEvents.slice(0, 10).map((e, i) => (
          <TouchableOpacity key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }} onPress={() => Linking.openURL(e.url)}>
            <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }} numberOfLines={2}>{e.name}</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{e.date}{e.time ? ` ${e.time}` : ''} · {e.venue}</Text>
          </TouchableOpacity>
        ));

      case 'deals':
        if (nearbyDeals.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No deals right now', 'Aucune offre en ce moment')}</Text>;
        return nearbyDeals.map((v, i) => (
          <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }}>{v.name}</Text>
              {v.isActive && <View style={{ backgroundColor: '#00A78D', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>NOW</Text></View>}
            </View>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{v.address}</Text>
            {(v.isActive ? v.activeDeals : v.upcomingDeals).map((d: any, j: number) => (
              <Text key={j} style={{ fontSize: fonts.sm, color: v.isActive ? '#00A78D' : colours.accent, marginTop: 2 }}>{d.description}</Text>
            ))}
          </View>
        ));

      case 'transit':
        if (stopsLoading) return <ActivityIndicator color={colours.accent} style={{ marginTop: 20 }} />;
        if (stops.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No nearby stops', 'Aucun arret a proximite')}</Text>;
        return stops.map((s: any, i: number) => (
          <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{s.name || `Stop #${s.id}`}</Text>
            {s.routes && <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Routes', 'Lignes')}: {s.routes.join(', ')}</Text>}
          </View>
        ));

      case 'news':
        if (filteredNews.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No local news', 'Aucune nouvelle locale')}</Text>;
        return filteredNews.slice(0, 8).map((a, i) => (
          <TouchableOpacity key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }} onPress={() => Linking.openURL(a.link)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <View style={{ backgroundColor: SOURCE_COLOURS[a.source] || colours.accent, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{a.source}</Text>
              </View>
              <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600' }}>{timeAgo(a.pubDate, language)}</Text>
            </View>
            <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }} numberOfLines={2}>{a.title}</Text>
          </TouchableOpacity>
        ));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        {/* Header */}
        <View style={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colours.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text }}>{name}</Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{description}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 12, backgroundColor: colours.surface, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colours.border }}>
              <Ionicons name="close" size={18} color={colours.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 12 }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: isActive ? n.accent + '18' : colours.surface,
                    borderWidth: 1, borderColor: isActive ? n.accent + '40' : colours.border,
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
                  }}
                >
                  <Ionicons name={tab.icon as any} size={14} color={isActive ? n.accent : colours.muted} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: isActive ? n.accent : colours.muted }}>
                    {language === 'fr' ? tab.label_fr : tab.label_en}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {renderContent()}
        </ScrollView>

        {/* Plan Route button */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 34, paddingTop: 10, borderTopWidth: 1, borderTopColor: colours.border }}>
          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push(`/(tabs)/planner?toLat=${n.lat}&toLng=${n.lng}&toLabel=${encodeURIComponent(name)}` as any);
            }}
            style={{ backgroundColor: n.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: fonts.md, fontWeight: '700' }}>{t('Plan Route', 'Planifier un trajet')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
