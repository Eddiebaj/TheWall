import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { ContentSkeleton } from '../components/Shimmer';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { HAPPY_HOUR_VENUES } from '../lib/happyHourData';
import { Neighbourhood } from '../lib/neighbourhoodData';
import { NewsArticle, SOURCE_COLOURS, timeAgo } from '../lib/newsData';
import { getDeviceId } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';

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

  // Transit score state
  const [transitScore, setTransitScore] = useState<{ transit_score: number; stop_count: number; route_count: number; avg_frequency: number } | null>(null);

  // Deal submission state
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealVenueName, setDealVenueName] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [dealError, setDealError] = useState('');
  const [dealSubmitted, setDealSubmitted] = useState(false);
  const [communityDeals, setCommunityDeals] = useState<{ id: string; venue_name: string; deal_description: string; created_at: string }[]>([]);
  const [dealVotes, setDealVotes] = useState<Record<string, { up: number; down: number }>>({});
  const [myVotes, setMyVotes] = useState<Record<string, 'up' | 'down'>>({});

  const n = neighbourhood;

  useEffect(() => {
    if (!visible || !n) return;
    setActiveTab('places');
    setPlaces([]);
    setStops([]);
    setShowDealForm(false);
    setDealSubmitted(false);
    setCommunityDeals([]);
    setDealVotes({});
    setMyVotes({});
    setTransitScore(null);
  }, [visible, n?.id]);

  useEffect(() => {
    if (!visible || !n) return;
    if (activeTab === 'places' && places.length === 0) fetchPlaces();
    if (activeTab === 'transit' && stops.length === 0) fetchStops();
    if (activeTab === 'transit' && !transitScore) fetchTransitScore();
    if (activeTab === 'deals' && communityDeals.length === 0) fetchCommunityDeals();
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

  const fetchTransitScore = async () => {
    if (!n) return;
    try {
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/community?action=transit_score&neighbourhood=${n.id}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (data.transit_score != null) {
        setTransitScore({
          transit_score: data.transit_score,
          stop_count: data.stop_count,
          route_count: data.route_count,
          avg_frequency: data.avg_frequency,
        });
      }
    } catch (e) { if (__DEV__) console.warn('fetch transit score failed:', e); }
  };

  const fetchCommunityDeals = async () => {
    if (!n) return;
    try {
      const { data } = await supabase
        .from('community_deals')
        .select('id, venue_name, deal_description, created_at')
        .eq('neighbourhood_id', n.id)
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setCommunityDeals(data);

      // Fetch votes for deals in this neighbourhood
      try {
        const vResp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/community?action=deal.votes&neighbourhood_id=${n.id}`);
        if (vResp.ok) {
          const vData = await vResp.json();
          if (vData.votes) setDealVotes(vData.votes);
        }
      } catch (_) {}

      // Load my votes from local storage
      try {
        const stored = await AsyncStorage.getItem('routeo_my_deal_votes');
        if (stored) setMyVotes(JSON.parse(stored));
      } catch (_) {}
    } catch (e) { if (__DEV__) console.warn('fetch community deals failed:', e); }
  };

  const submitDeal = async () => {
    if (!n || !dealVenueName.trim() || !dealDescription.trim()) return;
    setDealSubmitting(true);
    setDealError('');
    try {
      await supabase.from('community_deals').insert({
        neighbourhood_id: n.id,
        venue_name: dealVenueName.trim(),
        deal_description: dealDescription.trim(),
        approved: false,
      });
      setDealSubmitted(true);
      setDealVenueName('');
      setDealDescription('');
    } catch (e) {
      if (__DEV__) console.warn('submit deal failed:', e);
      setDealError(t('Could not submit deal. Check your connection.', 'Impossible de soumettre. Verifiez votre connexion.'));
    }
    setDealSubmitting(false);
  };

  const voteDeal = async (dealId: string, voteType: 'up' | 'down') => {
    const deviceId = await getDeviceId();
    // Optimistic update
    setDealVotes(prev => {
      const current = prev[dealId] || { up: 0, down: 0 };
      const oldVote = myVotes[dealId];
      const updated = { ...current };
      if (oldVote) updated[oldVote]--;
      if (oldVote !== voteType) updated[voteType]++;
      return { ...prev, [dealId]: updated };
    });
    const newVote = myVotes[dealId] === voteType ? undefined : voteType;
    setMyVotes(prev => {
      const next = { ...prev };
      if (newVote) next[dealId] = newVote; else delete next[dealId];
      return next;
    });
    // Save locally
    const updated = { ...myVotes };
    if (newVote) updated[dealId] = newVote; else delete updated[dealId];
    await AsyncStorage.setItem('routeo_my_deal_votes', JSON.stringify(updated));
    // Send to backend
    if (newVote) {
      try {
        await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=deal.vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deal_id: dealId, device_id: deviceId, vote_type: newVote }),
        });
      } catch (e) { if (__DEV__) console.warn('vote deal failed:', e); }
    }
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
        if (placesLoading) return <ContentSkeleton colours={colours} />;
        if (places.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No places found', 'Aucun lieu trouve')}</Text>;
        return places.map((p: any, i: number) => (
          <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }} onPress={() => { if (p.place_id) Linking.openURL(`https://www.google.com/maps/place/?q=place_id:${p.place_id}`); }}>
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: n.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
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
        return (
          <>
            {/* Existing happy hour deals */}
            {nearbyDeals.length > 0 && nearbyDeals.map((v, i) => (
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
            ))}

            {nearbyDeals.length === 0 && communityDeals.length === 0 && !showDealForm && (
              <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No deals right now', 'Aucune offre en ce moment')}</Text>
            )}

            {/* Community-submitted deals */}
            {communityDeals.length > 0 && (
              <View style={{ marginTop: nearbyDeals.length > 0 ? 16 : 0 }}>
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  {t('Community Deals', 'Offres communautaires')}
                </Text>
                {communityDeals.map((d, i) => {
                  const votes = dealVotes[d.id] || { up: 0, down: 0 };
                  const myVote = myVotes[d.id];
                  const confirmed = votes.up >= 3;
                  return (
                    <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text, flex: 1 }}>{d.venue_name}</Text>
                        {confirmed && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#00A78D' + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Ionicons name="checkmark-circle" size={12} color="#00A78D" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#00A78D' }}>{votes.up} {t('confirmed', 'confirme')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: fonts.sm, color: colours.accent, marginTop: 2 }}>{d.deal_description}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
                        <TouchableOpacity onPress={() => voteDeal(d.id, 'up')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name={myVote === 'up' ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={myVote === 'up' ? '#00A78D' : colours.muted} />
                          <Text style={{ fontSize: fonts.sm, color: myVote === 'up' ? '#00A78D' : colours.muted, fontWeight: '600' }}>{votes.up}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => voteDeal(d.id, 'down')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name={myVote === 'down' ? 'thumbs-down' : 'thumbs-down-outline'} size={14} color={myVote === 'down' ? colours.orange : colours.muted} />
                          <Text style={{ fontSize: fonts.sm, color: myVote === 'down' ? colours.orange : colours.muted, fontWeight: '600' }}>{votes.down}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Submit deal button / form */}
            <View style={{ marginTop: 16 }}>
              {dealSubmitted ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Ionicons name="checkmark-circle" size={28} color="#00A78D" />
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 6 }}>{t('Thanks! Your deal will be reviewed.', 'Merci! Votre offre sera examinee.')}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setDealSubmitted(false);
                      setDealVenueName('');
                      setDealDescription('');
                    }}
                    style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: colours.accent + '15', borderWidth: 1, borderColor: colours.accent + '30' }}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colours.accent, textAlign: 'center' }}>{t('Done', 'Fermer')}</Text>
                  </TouchableOpacity>
                </View>
              ) : showDealForm ? (
                <View style={{ backgroundColor: colours.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colours.border }}>
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginBottom: 8 }}>{t('Submit a Deal', 'Soumettre une offre')}</Text>
                  <TextInput
                    style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fonts.md, color: colours.text, marginBottom: 8 }}
                    placeholder={t('Venue name', 'Nom du lieu')}
                    placeholderTextColor={colours.muted}
                    value={dealVenueName}
                    onChangeText={setDealVenueName}
                  />
                  <TextInput
                    style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fonts.md, color: colours.text, minHeight: 60, textAlignVertical: 'top', marginBottom: 10 }}
                    placeholder={t('Deal details (e.g. $5 pints Mon-Fri 3-6pm)', 'Details de l\'offre (ex. $5 pintes lun-ven 15h-18h)')}
                    placeholderTextColor={colours.muted}
                    value={dealDescription}
                    onChangeText={setDealDescription}
                    multiline
                  />
                  {dealError !== '' && (
                    <Text style={{ fontSize: 12, color: '#ff3b30', fontWeight: '600', marginBottom: 8 }}>{dealError}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => setShowDealForm(false)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                      <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={submitDeal}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: dealVenueName.trim() && dealDescription.trim() ? n.accent : colours.border, alignItems: 'center' }}
                    >
                      {dealSubmitting
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: dealVenueName.trim() && dealDescription.trim() ? '#fff' : colours.muted }}>{t('Submit', 'Soumettre')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowDealForm(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: n.accent + '40', borderStyle: 'dashed' }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={n.accent} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: n.accent }}>{t('Know a deal? Submit it here', 'Vous connaissez une offre? Soumettez-la ici')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        );

      case 'transit':
        return (
          <>
            {/* Transit score card */}
            {transitScore && (
              <View style={{ backgroundColor: n.accent + '12', borderRadius: 12, padding: 16, marginTop: 12, marginBottom: 8, borderWidth: 1, borderColor: n.accent + '30', alignItems: 'center' }}>
                <Text style={{ fontSize: 36, fontWeight: '900', color: n.accent }}>{transitScore.transit_score}</Text>
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginTop: 2 }}>{t('Transit Score', 'Score transit')}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 14 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{transitScore.stop_count}</Text>
                    <Text style={{ fontSize: fonts.xs || 10, color: colours.muted, fontWeight: '600', marginTop: 2 }}>{t('stops', 'arrets')}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{transitScore.route_count}</Text>
                    <Text style={{ fontSize: fonts.xs || 10, color: colours.muted, fontWeight: '600', marginTop: 2 }}>{t('routes', 'lignes')}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text }}>{transitScore.avg_frequency}</Text>
                    <Text style={{ fontSize: fonts.xs || 10, color: colours.muted, fontWeight: '600', marginTop: 2 }}>{t('min avg frequency', 'min freq. moy.')}</Text>
                  </View>
                </View>
              </View>
            )}
            {/* Stops list */}
            {stopsLoading && <ContentSkeleton colours={colours} />}
            {!stopsLoading && stops.length === 0 && (
              <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No nearby stops', 'Aucun arret a proximite')}</Text>
            )}
            {!stopsLoading && stops.map((s: any, i: number) => (
              <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{s.name || `Stop #${s.id}`}</Text>
                {s.routes && <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{t('Routes', 'Lignes')}: {s.routes.join(', ')}</Text>}
              </View>
            ))}
          </>
        );

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
        {!n ? null : <>
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
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
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
            style={{ backgroundColor: n.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: fonts.md, fontWeight: '700' }}>{t('Plan Route', 'Planifier un trajet')}</Text>
          </TouchableOpacity>
        </View>
      </>}
      </View>
    </Modal>
  );
}
