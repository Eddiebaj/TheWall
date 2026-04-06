import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Modal, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
let ImagePickerModule: typeof import('expo-image-picker') | null = null;
try { ImagePickerModule = require('expo-image-picker'); } catch {}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { ContentSkeleton } from '../components/Shimmer';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { haversineKm } from '../lib/geo';
import { HAPPY_HOUR_VENUES } from '../lib/happyHourData';
import { Neighbourhood } from '../lib/neighbourhoodData';
import { NewsArticle, SOURCE_COLOURS, timeAgo } from '../lib/newsData';
import { getDeviceId } from '../lib/pushNotifications';
import { SK_MY_DEAL_VOTES, SK_DEAL_SUBMIT_PREFIX } from '../lib/storageKeys';
import { supabase } from '../lib/supabase';
import { toTitleCase } from '../lib/utils';

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

const TABS: { id: Tab; icon: string; label_en: string; label_fr: string }[] = [
  { id: 'places', icon: 'location', label_en: 'Places', label_fr: 'Lieux' },
  { id: 'events', icon: 'calendar', label_en: 'Events', label_fr: '\u00C9v\u00E9nements' },
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
  const [placesError, setPlacesError] = useState(false);
  const [stops, setStops] = useState<any[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const fetchedTabs = useRef<Set<string>>(new Set());

  // Transit score state
  const [transitScore, setTransitScore] = useState<{ transit_score: number; stop_count: number; route_count: number; avg_frequency: number } | null>(null);

  // Deal submission state
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealVenueName, setDealVenueName] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [dealError, setDealError] = useState('');
  const [dealSubmitted, setDealSubmitted] = useState(false);
  const [dealPhoto, setDealPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [dealStatus, setDealStatus] = useState<'approved' | 'pending_review' | 'rejected' | null>(null);
  const [dealModerationReason, setDealModerationReason] = useState('');
  const [communityDeals, setCommunityDeals] = useState<{ id: string; venue_name: string; deal_description: string; photo_url?: string; created_at: string }[]>([]);
  const [dealVotes, setDealVotes] = useState<Record<string, { up: number; down: number }>>({});
  const [myVotes, setMyVotes] = useState<Record<string, 'up' | 'down'>>({});
  const myVotesRef = useRef(myVotes);
  useEffect(() => { myVotesRef.current = myVotes; }, [myVotes]);

  const n = neighbourhood;

  useEffect(() => {
    if (!visible || !n) return;
    setActiveTab('places');
    setPlaces([]);
    setStops([]);
    setShowDealForm(false);
    setDealSubmitted(false);
    setDealPhoto(null);
    setDealStatus(null);
    setDealModerationReason('');
    setCommunityDeals([]);
    setDealVotes({});
    setMyVotes({});
    setTransitScore(null);
    fetchedTabs.current = new Set();
  }, [visible, n?.id]);

  useEffect(() => {
    if (!visible || !n) return;
    if (activeTab === 'places' && !fetchedTabs.current.has('places')) { fetchedTabs.current.add('places'); fetchPlaces(); }
    if (activeTab === 'transit' && !fetchedTabs.current.has('transit')) { fetchedTabs.current.add('transit'); fetchStops(); fetchTransitScore(); }
    if (activeTab === 'deals' && !fetchedTabs.current.has('deals')) { fetchedTabs.current.add('deals'); fetchCommunityDeals(); }
  }, [activeTab, visible]);

  const fetchPlaces = async () => {
    if (!n) return;
    setPlacesLoading(true);
    setPlacesError(false);
    try {
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?lat=${n.lat}&lng=${n.lng}&type=point_of_interest&radius=800`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      setPlaces((data.results || []).slice(0, 15));
    } catch (e) {
      if (__DEV__) console.warn('fetch neighbourhood places failed:', e);
      setPlacesError(true);
    }
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
        .select('id, venue_name, deal_description, photo_url, created_at')
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
      } catch (e) { if (__DEV__) console.warn(e); }

      // Load my votes from local storage
      try {
        const stored = await AsyncStorage.getItem(SK_MY_DEAL_VOTES);
        if (stored) setMyVotes(JSON.parse(stored));
      } catch (e) { if (__DEV__) console.warn(e); }
    } catch (e) { if (__DEV__) console.warn('fetch community deals failed:', e); }
  };

  const pickDealPhoto = async () => {
    if (!ImagePickerModule) return;
    try {
      const { status } = await ImagePickerModule.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('Permission needed', 'Permission requise'), t('Allow photo access to attach a photo.', 'Autorisez l\'acc\u00e8s aux photos pour en joindre une.'));
        return;
      }
      const result = await ImagePickerModule.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        setDealPhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 || '' });
      }
    } catch (e) { if (__DEV__) console.warn('Photo pick failed:', e); }
  };

  const takeDealPhoto = async () => {
    if (!ImagePickerModule) return;
    try {
      const { status } = await ImagePickerModule.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('Permission needed', 'Permission requise'), t('Allow camera access to take a photo.', 'Autorisez l\'acc\u00e8s \u00e0 la cam\u00e9ra pour prendre une photo.'));
        return;
      }
      const result = await ImagePickerModule.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        setDealPhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 || '' });
      }
    } catch (e) { if (__DEV__) console.warn('Camera failed:', e); }
  };

  const submitDeal = async () => {
    if (!n || !dealVenueName.trim() || !dealDescription.trim()) return;
    setDealSubmitting(true);
    setDealError('');
    setDealStatus(null);
    setDealModerationReason('');
    try {
      const deviceId = await getDeviceId();
      if (deviceId) {
        const lastSubmitKey = `${SK_DEAL_SUBMIT_PREFIX}${deviceId}`;
        const lastSubmit = await AsyncStorage.getItem(lastSubmitKey);
        if (lastSubmit) {
          const elapsed = Date.now() - parseInt(lastSubmit, 10);
          if (elapsed < 24 * 60 * 60 * 1000) {
            setDealError(t('You can only submit one deal per day.', 'Vous ne pouvez soumettre qu\'une offre par jour.'));
            setDealSubmitting(false);
            return;
          }
        }
      }

      const resp = await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=deal.submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_name: dealVenueName.trim(),
          deal_description: dealDescription.trim(),
          neighbourhood_id: n.id,
          device_id: deviceId || 'anonymous',
          photo_base64: dealPhoto?.base64 || null,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        setDealError(errData?.error || t('Submission failed', 'La soumission a \u00e9chou\u00e9'));
        setDealSubmitting(false);
        return;
      }

      const data = await resp.json();
      setDealSubmitted(true);
      setDealStatus(data.status || 'pending_review');
      setDealModerationReason(data.moderation_reason || '');
      setDealVenueName('');
      setDealDescription('');
      setDealPhoto(null);
      if (deviceId) {
        await AsyncStorage.setItem(`${SK_DEAL_SUBMIT_PREFIX}${deviceId}`, String(Date.now()));
      }
    } catch (e) {
      if (__DEV__) console.warn('submit deal failed:', e);
      setDealError(t('Could not submit deal. Check your connection.', 'Impossible de soumettre. V\u00e9rifiez votre connexion.'));
    }
    setDealSubmitting(false);
  };

  const [dealVoteError, setDealVoteError] = useState('');

  const voteDeal = async (dealId: string, voteType: 'up' | 'down') => {
    const deviceId = await getDeviceId();
    // Read from ref to avoid stale closure
    const currentMyVotes = myVotesRef.current;
    // Save previous state for rollback
    const prevDealVotes = { ...dealVotes };
    const prevMyVotes = { ...currentMyVotes };
    // Optimistic update
    setDealVotes(prev => {
      const current = prev[dealId] || { up: 0, down: 0 };
      const oldVote = currentMyVotes[dealId];
      const updated = { ...current };
      if (oldVote) updated[oldVote]--;
      if (oldVote !== voteType) updated[voteType]++;
      return { ...prev, [dealId]: updated };
    });
    const newVote = currentMyVotes[dealId] === voteType ? undefined : voteType;
    setMyVotes(prev => {
      const next = { ...prev };
      if (newVote) next[dealId] = newVote; else delete next[dealId];
      return next;
    });
    // Save locally — use ref to avoid stale closure
    const updated = { ...myVotesRef.current };
    if (newVote) updated[dealId] = newVote; else delete updated[dealId];
    await AsyncStorage.setItem(SK_MY_DEAL_VOTES, JSON.stringify(updated));
    // Send to backend
    if (newVote) {
      try {
        await fetchWithTimeout('https://routeo-backend.vercel.app/api/community?action=deal.vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deal_id: dealId, device_id: deviceId, vote_type: newVote }),
        });
      } catch (e) {
        if (__DEV__) console.warn('vote deal failed:', e);
        // Rollback on failure
        setDealVotes(prevDealVotes);
        setMyVotes(prevMyVotes);
        await AsyncStorage.setItem(SK_MY_DEAL_VOTES, JSON.stringify(prevMyVotes));
        setDealVoteError(t('Vote failed. Try again.', 'Le vote a \u00e9chou\u00e9. R\u00e9essayez.'));
        setTimeout(() => setDealVoteError(''), 3000);
      }
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
        if (placesError) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('Could not load places', 'Impossible de charger les lieux')}</Text>;
        if (places.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No places found', 'Aucun lieu trouv\u00e9')}</Text>;
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
        if (nearbyEvents.length === 0) return <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No upcoming events nearby', 'Aucun \u00e9v\u00e9nement \u00e0 proximit\u00e9')}</Text>;
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
                  {v.isActive && <View style={{ backgroundColor: '#00A78D', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{t('NOW', 'ACTIF')}</Text></View>}
                </View>
                <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>{v.address}</Text>
                {(v.isActive ? v.activeDeals : v.upcomingDeals).map((d: any, j: number) => (
                  <Text key={j} style={{ fontSize: fonts.sm, color: v.isActive ? '#00A78D' : colours.accent, marginTop: 2 }}>{language === 'fr' && d.description_fr ? d.description_fr : d.description}</Text>
                ))}
              </View>
            ))}

            {nearbyDeals.length === 0 && communityDeals.length === 0 && !showDealForm && (
              <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No deals right now', 'Aucune offre en ce moment')}</Text>
            )}

            {/* Community-submitted deals */}
            {communityDeals.length > 0 && (
              <View style={{ marginTop: nearbyDeals.length > 0 ? 16 : 0 }}>
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 8 }}>
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
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#00A78D' }}>{votes.up} {t('confirmed', 'confirm\u00e9')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: fonts.sm, color: colours.accent, marginTop: 2 }}>{d.deal_description}</Text>
                      {d.photo_url && (
                        <Image source={{ uri: d.photo_url }} style={{ width: '100%', height: 120, borderRadius: 8, marginTop: 6 }} resizeMode="cover" />
                      )}
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

            {dealVoteError !== '' && (
              <Text style={{ fontSize: 12, color: '#ff3b30', fontWeight: '600', marginTop: 8, textAlign: 'center' }}>{dealVoteError}</Text>
            )}

            {/* Submit deal button / form */}
            <View style={{ marginTop: 16 }}>
              {dealSubmitted ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <Ionicons
                    name={dealStatus === 'approved' ? 'checkmark-circle' : dealStatus === 'rejected' ? 'close-circle' : 'time'}
                    size={28}
                    color={dealStatus === 'approved' ? '#00A78D' : dealStatus === 'rejected' ? '#cc3b2a' : colours.accent}
                  />
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 6 }}>
                    {dealStatus === 'approved'
                      ? t('Deal approved and live!', 'Offre approuv\u00e9e et en ligne!')
                      : dealStatus === 'rejected'
                      ? t('Deal not approved.', 'Offre non approuv\u00e9e.')
                      : t('Thanks! Your deal is being reviewed.', 'Merci! Votre offre est en cours de r\u00e9vision.')}
                  </Text>
                  {dealModerationReason !== '' && (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, textAlign: 'center' }}>{dealModerationReason}</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setDealSubmitted(false);
                      setDealVenueName('');
                      setDealDescription('');
                      setDealStatus(null);
                      setDealModerationReason('');
                    }}
                    style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: colours.tintBg, borderWidth: 1, borderColor: colours.accent + '30' }}
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
                  {/* Photo picker */}
                  {dealPhoto ? (
                    <View style={{ marginBottom: 10, alignItems: 'center' }}>
                      <Image source={{ uri: dealPhoto.uri }} style={{ width: '100%', height: 160, borderRadius: 8 }} resizeMode="cover" />
                      <TouchableOpacity onPress={() => setDealPhoto(null)} style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : ImagePickerModule ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                      <TouchableOpacity onPress={takeDealPhoto} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colours.border, borderStyle: 'dashed' }}>
                        <Ionicons name="camera-outline" size={16} color={colours.muted} />
                        <Text style={{ fontSize: fonts.sm, color: colours.muted, fontWeight: '600' }}>{t('Camera', 'Cam\u00e9ra')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={pickDealPhoto} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colours.border, borderStyle: 'dashed' }}>
                        <Ionicons name="image-outline" size={16} color={colours.muted} />
                        <Text style={{ fontSize: fonts.sm, color: colours.muted, fontWeight: '600' }}>{t('Gallery', 'Galerie')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
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
                <Text style={{ fontSize: 36, fontWeight: '700', color: n.accent }}>{transitScore.transit_score}</Text>
                <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, marginTop: 2 }}>{t('Transit Score', 'Score transit')}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 14 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{transitScore.stop_count}</Text>
                    <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600', marginTop: 2 }}>{t('stops', 'arr\u00eats')}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{transitScore.route_count}</Text>
                    <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600', marginTop: 2 }}>{t('routes', 'lignes')}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>{transitScore.avg_frequency}</Text>
                    <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600', marginTop: 2 }}>{t('min avg frequency', 'min freq. moy.')}</Text>
                  </View>
                </View>
              </View>
            )}
            {/* Stops list */}
            {stopsLoading && <ContentSkeleton colours={colours} />}
            {!stopsLoading && stops.length === 0 && (
              <Text style={{ color: colours.muted, fontSize: fonts.sm, textAlign: 'center', marginTop: 20 }}>{t('No nearby stops', 'Aucun arr\u00eat \u00e0 proximit\u00e9')}</Text>
            )}
            {!stopsLoading && stops.map((s: any, i: number) => (
              <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <Text style={{ fontSize: fonts.md, fontWeight: '600', color: colours.text }}>{toTitleCase(s.name) || `Stop #${s.id}`}</Text>
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
                <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>{a.source}</Text>
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
              <Text style={{ fontSize: fonts.xxl, fontWeight: '700', color: colours.text }}>{name}</Text>
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
