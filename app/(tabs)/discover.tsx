import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, ImageBackground, KeyboardAvoidingView, Linking,
  Modal, Platform, RefreshControl, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { cardShadow as sharedCardShadow } from '../../lib/styles';
import { NewsArticle, timeAgo } from '../../lib/newsData';
import { SK_NEWS_CACHE, SK_FOLLOWED_VENUES, SK_JOINED_GROUPS, SK_LAST_DEAL_CHECK, SK_HOME_ADDRESS, SK_SAVED_BOARD } from '../../lib/storageKeys';
import { supabase } from '../../lib/supabase';
import { haversineKm } from '../../lib/geo';
import { HAPPY_HOUR_VENUES } from '../../lib/happyHourData';
import { useRouter } from 'expo-router';
import { ScreenErrorBoundary } from '../../components/ScreenErrorBoundary';
import { FeedCardSkeleton, HorizontalCardsSkeleton } from '../../components/Shimmer';
import { useIsPremium } from '../../lib/premium';
import { PREMIUM_ENABLED } from '../../lib/flags';
import RsvpButton from '../../components/RsvpButton';
import { NEIGHBOURHOOD_GROUPS, NeighbourhoodGroup } from '../../lib/neighbourhoodGroups';
import GroupFeedSheet from '../../components/GroupFeedSheet';
import { addAndSave, loadProfile, TASTE_POINTS } from '../../lib/tasteProfile';

const COMMUNITY_URL = 'https://routeo-backend.vercel.app/api/community';
const STRIPE_PAYMENT_LINK = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK ?? '';
const PLAN_URL = 'https://routeo-backend.vercel.app/api/plan';

const MAJOR_STOPS = [
  { lat: 45.4215, lng: -75.6919, name: 'Parliament Station' },
  { lat: 45.4260, lng: -75.6916, name: 'Rideau Station' },
  { lat: 45.4035, lng: -75.7277, name: 'Bayview Station' },
  { lat: 45.3993, lng: -75.6446, name: 'Hurdman Station' },
  { lat: 45.4286, lng: -75.6060, name: 'Blair Station' },
  { lat: 45.4153, lng: -75.6472, name: 'St-Laurent Station' },
];

type BusinessDeal = {
  id: string;
  business_name: string;
  deal_title: string;
  deal_description: string;
  photo_url?: string;
  address?: string;
  category?: string;
};

type CommunityDeal = {
  id: string;
  venue_name: string;
  deal_text: string;
  day_of_week: number;
  submitted_at: string;
  early_access?: boolean;
};

type WeekendEvent = {
  id: string;
  name: string;
  date: string;
  time?: string;
  venue: string;
  url: string;
  image?: string;
  source: 'ticketmaster' | 'eventbrite' | 'happyhour';
  category?: string;
};

function DiscoverScreenInner() {
  const { colours, theme, resolvedTheme, t, fonts, language } = useApp();
  const isLight = resolvedTheme === 'light';
  const insets = useSafeAreaInsets();
  const isPremium = useIsPremium();
  const router = useRouter();

  const cardShadow = isLight ? sharedCardShadow : {};

  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [allCommunityDeals, setAllCommunityDeals] = useState<CommunityDeal[]>([]);
  // Filter out early_access deals for non-premium users when the flag is active
  const communityDeals = (PREMIUM_ENABLED && !isPremium)
    ? allCommunityDeals.filter(d => !d.early_access)
    : allCommunityDeals;
  const [weekendEvents, setWeekendEvents] = useState<WeekendEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, number>>({});
  const [categoryPrefs, setCategoryPrefs] = useState<Record<string, number>>({});
  const [followedVenues, setFollowedVenues] = useState<string[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<string[]>([]);
  const [groupFeedGroup, setGroupFeedGroup] = useState<NeighbourhoodGroup | null>(null);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [transitHomeFilter, setTransitHomeFilter] = useState(false);
  const [homePlace, setHomePlace] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [boardStopAnchors, setBoardStopAnchors] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [lastBusCache, setLastBusCache] = useState<Record<string, string | null>>({});
  const [lastBusLoading, setLastBusLoading] = useState<Record<string, boolean>>({});

  const [businessDeals, setBusinessDeals] = useState<BusinessDeal[]>([]);
  const [businessDealsLoading, setBusinessDealsLoading] = useState(true);

  const [listBizVisible, setListBizVisible] = useState(false);
  const [listBizEmail, setListBizEmail] = useState('');
  const [listBizLoading, setListBizLoading] = useState(false);
  const [listBizDone, setListBizDone] = useState(false);

  useEffect(() => {
    // Load home address and board stops for Transit+Home filter
    AsyncStorage.getItem(SK_HOME_ADDRESS).then(raw => {
      if (raw) { try { const h = JSON.parse(raw); if (h?.lat && h?.lng) setHomePlace(h); } catch {} }
    }).catch(() => {});
    AsyncStorage.getItem(SK_SAVED_BOARD).then(raw => {
      if (!raw) return;
      try {
        const board: any[] = JSON.parse(raw);
        const stopIds = board.filter(b => b.type === 'bus_stop' || b.type === 'lrt_station').map(b => b.id).slice(0, 10);
        if (stopIds.length === 0) return;
        supabase.from('stops').select('stop_id, stop_lat, stop_lon, stop_name').in('stop_id', stopIds).then(({ data }) => {
          if (data) setBoardStopAnchors(data.filter(s => s.stop_lat && s.stop_lon).map(s => ({ lat: s.stop_lat, lng: s.stop_lon, name: s.stop_name || s.stop_id })));
        }).catch(() => {});
      } catch {}
    }).catch(() => {});
    // Direct news fetch instead of relying on SK_NEWS_CACHE (M14)
    fetchWithTimeout('https://routeo-backend.vercel.app/api/news').then(async resp => {
      if (resp.ok) {
        const data = await resp.json();
        const articles = data.articles || [];
        setNewsArticles(articles);
        AsyncStorage.setItem(SK_NEWS_CACHE, JSON.stringify({ articles })).catch(() => {});
      } else {
        // Fall back to cache
        const cached = await AsyncStorage.getItem(SK_NEWS_CACHE);
        if (cached) { try { setNewsArticles(JSON.parse(cached).articles || []); } catch (e) { if (__DEV__) console.warn(e); } }
      }
    }).catch(async () => {
      const cached = await AsyncStorage.getItem(SK_NEWS_CACHE);
      if (cached) { try { setNewsArticles(JSON.parse(cached).articles || []); } catch (e) { if (__DEV__) console.warn(e); } }
    });
    Promise.resolve(supabase.from('community_deals').select('*').gte('submitted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order('submitted_at', { ascending: false }).limit(10))
      .then(({ data, error }) => {
        if (error) { if (__DEV__) console.warn('Supabase deals error:', error); setDealsError(true); }
        else if (data) { setAllCommunityDeals(data); }
        setDealsLoading(false);
      })
      .catch(() => { setDealsLoading(false); setDealsError(true); });
    fetchWeekendEvents();
    fetchBusinessDeals();
    loadProfile().then(p => setCategoryPrefs(p.categories)).catch(() => {});
    AsyncStorage.getItem(SK_FOLLOWED_VENUES).then(raw => {
      if (raw) { try { setFollowedVenues(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
    AsyncStorage.getItem(SK_JOINED_GROUPS).then(raw => {
      if (raw) { try { setJoinedGroups(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
    // Check for new community deals from followed venues and fire local notification
    (async () => {
      try {
        const followedRaw = await AsyncStorage.getItem(SK_FOLLOWED_VENUES);
        const followed: string[] = followedRaw ? JSON.parse(followedRaw) : [];
        if (followed.length === 0) return;
        const lastCheck = parseInt((await AsyncStorage.getItem(SK_LAST_DEAL_CHECK)) ?? '0', 10);
        const since = new Date(Math.max(lastCheck, Date.now() - 24 * 60 * 60 * 1000)).toISOString();
        const { data } = await Promise.resolve(
          supabase.from('community_deals').select('venue_name, deal_text').gte('submitted_at', since).limit(20)
        );
        await AsyncStorage.setItem(SK_LAST_DEAL_CHECK, String(Date.now()));
        const matches = (data ?? []).filter((d: { venue_name: string }) =>
          followed.some(f => d.venue_name.toLowerCase().includes(f.toLowerCase()))
        );
        if (matches.length === 0) return;
        const Notifs = require('expo-notifications');
        await Notifs.scheduleNotificationAsync({
          content: {
            title: `${matches[0].venue_name} posted a new deal`,
            body: matches[0].deal_text,
            data: { type: 'new_venue_deal' },
            sound: 'default',
          },
          trigger: null,
        });
      } catch {}
    })();
  }, []);

  const fetchBusinessDeals = async () => {
    setBusinessDealsLoading(true);
    try {
      const r = await fetchWithTimeout(`${COMMUNITY_URL}?action=business.deals`);
      if (r.ok) {
        const data = await r.json();
        setBusinessDeals(data.deals || []);
      }
    } catch (e) {
      if (__DEV__) console.warn('[discover] fetchBusinessDeals error:', e);
    }
    setBusinessDealsLoading(false);
  };

  const handleListBizSubmit = async () => {
    const email = listBizEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setListBizLoading(true);
    try {
      await fetchWithTimeout(`${COMMUNITY_URL}?action=business.register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setListBizDone(true);
      // Open Stripe payment link — business completes checkout, webhook activates account
      if (STRIPE_PAYMENT_LINK) {
        Linking.openURL(STRIPE_PAYMENT_LINK).catch(() => {});
      } else if (__DEV__) {
        console.warn('[discover] EXPO_PUBLIC_STRIPE_PAYMENT_LINK is not set');
      }
    } catch (e) {
      if (__DEV__) console.warn('[discover] business.register error:', e);
    }
    setListBizLoading(false);
  };

  const fetchWeekendEvents = async () => {
    setEventsLoading(true);
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToStart = dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? 0 : 5 - dayOfWeek;
      const start = new Date(now);
      start.setDate(now.getDate() + daysToStart);
      const sunday = new Date(start);
      sunday.setDate(start.getDate() + (dayOfWeek === 6 ? 1 : dayOfWeek === 0 ? 0 : 2));
      const startDate = start.toISOString().split('T')[0] + 'T00:00:00Z';
      const endDate = sunday.toISOString().split('T')[0] + 'T23:59:59Z';
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/community?action=ticketmaster&city=Ottawa&radius=50&size=50`);
      if (resp.ok) {
        const d = await resp.json();
        const evs: WeekendEvent[] = (d._embedded?.events || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          date: e.dates?.start?.localDate || '',
          time: e.dates?.start?.localTime?.slice(0, 5),
          venue: e._embedded?.venues?.[0]?.name || '',
          url: e.url,
          image: e.images?.find((img: any) => img.ratio === '16_9' && img.width > 400)?.url || e.images?.[0]?.url,
          source: 'ticketmaster' as const,
          category: e.classifications?.[0]?.segment?.name || e.classifications?.[0]?.genre?.name,
        }));
        setWeekendEvents(evs);
      // Batch-fetch RSVP counts for all events
      if (evs.length > 0) {
        Promise.resolve(
          supabase.from('event_rsvps').select('event_id').in('event_id', evs.map((e: WeekendEvent) => e.id))
        ).then(({ data }) => {
          if (!data) return;
          const counts: Record<string, number> = {};
          for (const row of data) counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
          setRsvpCounts(counts);
        }).catch(() => {});
      }
      }
    } catch (e) { if (__DEV__) console.warn('fetch weekend events failed:', e); setEventsError(true); }
    setEventsLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        supabase.from('community_deals').select('*').gte('submitted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order('submitted_at', { ascending: false }).limit(10)
          .then(({ data }) => { if (data) setAllCommunityDeals(data); return null; }),
        fetchWeekendEvents(),
        fetchBusinessDeals(),
        fetchWithTimeout('https://routeo-backend.vercel.app/api/news').then(async resp => {
          if (resp.ok) {
            const data = await resp.json();
            setNewsArticles(data.articles || []);
            AsyncStorage.setItem(SK_NEWS_CACHE, JSON.stringify({ articles: data.articles || [] })).catch(() => {});
          }
        }).catch(() => {}),
      ]);
    } catch (e) {
      if (__DEV__) console.warn('refresh failed:', e);
    }
    setRefreshing(false);
  };

  const todayDow = new Date().getDay();

  const allTransitAnchors = useMemo(() => [...boardStopAnchors, ...MAJOR_STOPS], [boardStopAnchors]);

  const isNearTransit = useCallback((lat: number, lng: number): boolean =>
    allTransitAnchors.some(a => haversineKm(lat, lng, a.lat, a.lng) <= 0.5),
  [allTransitAnchors]);

  const transitVenues = useMemo(() => {
    if (!transitHomeFilter) return [];
    return HAPPY_HOUR_VENUES.filter(v => {
      if (!isNearTransit(v.lat, v.lng)) return false;
      return v.deals.some(d => d.days.includes(todayDow));
    });
  }, [transitHomeFilter, isNearTransit, todayDow]);

  const fetchLastBusHome = useCallback(async (venueKey: string, fromLat: number, fromLng: number) => {
    if (!homePlace || lastBusCache[venueKey] !== undefined || lastBusLoading[venueKey]) return;
    setLastBusLoading(prev => ({ ...prev, [venueKey]: true }));
    try {
      const now = new Date();
      const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }).split('-');
      const dateStr = `${m}-${d}-${y}`;
      const url = `${PLAN_URL}?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${homePlace.lat}&toLng=${homePlace.lng}&time=23%3A00&date=${encodeURIComponent(dateStr)}&mode=transit&arriveBy=false&numItineraries=1`;
      const resp = await fetchWithTimeout(url);
      if (resp.ok) {
        const data = await resp.json();
        const firstItin = data?.itineraries?.[0];
        if (firstItin) {
          const lastLeg = firstItin.legs?.[firstItin.legs.length - 1];
          const endTime = new Date(firstItin.endTime);
          const hrs = endTime.getHours();
          const mins = String(endTime.getMinutes()).padStart(2, '0');
          const period = hrs >= 12 ? 'pm' : 'am';
          const h12 = hrs > 12 ? hrs - 12 : hrs === 0 ? 12 : hrs;
          const stopName = lastLeg?.to?.name || '';
          const label = stopName ? `${h12}:${mins}${period} from ${stopName}` : `${h12}:${mins}${period}`;
          setLastBusCache(prev => ({ ...prev, [venueKey]: label }));
        } else {
          setLastBusCache(prev => ({ ...prev, [venueKey]: null }));
        }
      } else {
        setLastBusCache(prev => ({ ...prev, [venueKey]: null }));
      }
    } catch {
      setLastBusCache(prev => ({ ...prev, [venueKey]: null }));
    }
    setLastBusLoading(prev => ({ ...prev, [venueKey]: false }));
  }, [homePlace, lastBusCache, lastBusLoading]);

  const toggleFollowVenue = useCallback(async (venueName: string) => {
    const isFollowed = followedVenues.includes(venueName);
    const updated = isFollowed
      ? followedVenues.filter(v => v !== venueName)
      : [...followedVenues, venueName];
    setFollowedVenues(updated);
    await AsyncStorage.setItem(SK_FOLLOWED_VENUES, JSON.stringify(updated)).catch(() => {});
    if (!isFollowed) {
      addAndSave('venues', venueName, TASTE_POINTS.venue_follow);
    }
  }, [followedVenues]);

  // Trigger last-bus fetches whenever Transit+Home filter is active and venues change
  useEffect(() => {
    if (!transitHomeFilter || !homePlace) return;
    for (const venue of transitVenues) {
      const venueKey = `${venue.lat},${venue.lng}`;
      fetchLastBusHome(venueKey, venue.lat, venue.lng);
    }
  }, [transitVenues, transitHomeFilter, homePlace]);

  const handleEventGoing = useCallback((eventId: string) => {
    const ev = weekendEvents.find(e => e.id === eventId);
    if (!ev?.category) return;
    addAndSave('categories', ev.category, TASTE_POINTS.rsvp);
    setCategoryPrefs(prev => ({ ...prev, [ev.category!]: (prev[ev.category!] ?? 0) + TASTE_POINTS.rsvp }));
  }, [weekendEvents]);

  const sortedEvents = useMemo(() => {
    const now = new Date();
    const totalPrefs = Object.values(categoryPrefs).reduce((s, n) => s + n, 0) || 1;
    return [...weekendEvents].sort((a, b) => {
      const prefA = a.category ? (categoryPrefs[a.category] ?? 0) / totalPrefs : 0;
      const prefB = b.category ? (categoryPrefs[b.category] ?? 0) / totalPrefs : 0;
      const dateA = a.date ? new Date(a.date + 'T00:00:00').getTime() : 0;
      const dateB = b.date ? new Date(b.date + 'T00:00:00').getTime() : 0;
      const recencyA = dateA > 0 ? Math.max(0, 1 - (dateA - now.getTime()) / (7 * 24 * 60 * 60 * 1000)) : 0;
      const recencyB = dateB > 0 ? Math.max(0, 1 - (dateB - now.getTime()) / (7 * 24 * 60 * 60 * 1000)) : 0;
      const scoreA = prefA * 0.6 + recencyA * 0.4;
      const scoreB = prefB * 0.6 + recencyB * 0.4;
      return scoreB - scoreA;
    });
  }, [weekendEvents, categoryPrefs]);

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ paddingHorizontal: 20, marginTop: insets.top + 12, marginBottom: 10 }}>
        <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>
          {t('Local Feed', 'Fil local')}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colours.accent} />}
      >
        {/* Filter chips */}
        <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => setTransitHomeFilter(false)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: !transitHomeFilter ? colours.accent : colours.border, backgroundColor: !transitHomeFilter ? colours.accent + '15' : colours.surface }}
            >
              <Text style={{ fontSize: 13, fontWeight: !transitHomeFilter ? '700' : '500', color: !transitHomeFilter ? colours.accent : colours.muted }}>{t('All', 'Tout')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!homePlace) return;
                setTransitHomeFilter(v => !v);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: transitHomeFilter ? '#026CDF' : colours.border, backgroundColor: transitHomeFilter ? '#026CDF15' : colours.surface }}
            >
              <Ionicons name="bus" size={13} color={transitHomeFilter ? '#026CDF' : colours.muted} />
              <Text style={{ fontSize: 13, fontWeight: transitHomeFilter ? '700' : '500', color: transitHomeFilter ? '#026CDF' : colours.muted }}>{t('Transit + Home', 'Transit + Maison')}</Text>
            </TouchableOpacity>
          </ScrollView>
          {!homePlace && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/account' as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}
              activeOpacity={0.7}
            >
              <Ionicons name="home-outline" size={14} color={colours.muted} />
              <Text style={{ fontSize: 12, color: colours.muted, flex: 1 }}>{t('Save your home address in Settings to use this filter', 'Enregistrez votre adresse domicile dans les paramètres pour ce filtre')}</Text>
              <Ionicons name="chevron-forward" size={13} color={colours.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Transit + Home venues */}
        {transitHomeFilter && transitVenues.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
              {t('Venues Near Transit', 'Établissements près du transit')}
            </Text>
            {transitVenues.map(venue => {
              const venueKey = `${venue.lat},${venue.lng}`;
              const todayDeals = venue.deals.filter(d => d.days.includes(todayDow));
              const lastBus = lastBusCache[venueKey];
              const loadingBus = lastBusLoading[venueKey];
              return (
                <View key={venueKey} style={[{ borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, marginBottom: 10, overflow: 'hidden' }, cardShadow]}>
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>{venue.name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>{venue.address}</Text>
                    {todayDeals.length > 0 && (
                      <Text style={{ fontSize: 12, color: colours.accent, marginTop: 4 }} numberOfLines={2}>{todayDeals[0].description}</Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="bus-outline" size={11} color="#026CDF" />
                        {loadingBus ? (
                          <ActivityIndicator size="small" color="#026CDF" style={{ transform: [{ scale: 0.6 }] }} />
                        ) : lastBus ? (
                          <Text style={{ fontSize: 11, color: '#026CDF', fontWeight: '600' }}>{t(`Last bus home: ${lastBus}`, `Dernier bus: ${lastBus}`)}</Text>
                        ) : lastBus === null ? (
                          <Text style={{ fontSize: 11, color: colours.muted }}>{t('No late bus home', 'Pas de bus tard')}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  {homePlace && (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/(tabs)/planner', params: { fromLabel: venue.name, fromLat: String(venue.lat), fromLng: String(venue.lng), toLabel: homePlace.label, toLat: String(homePlace.lat), toLng: String(homePlace.lng) } } as any)}
                      style={{ borderTopWidth: 1, borderTopColor: colours.border, paddingVertical: 10, alignItems: 'center', backgroundColor: '#026CDF08' }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#026CDF' }}>{t('Get home from here', 'Rentrer à la maison')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* New deals this week */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
            {t('New Deals This Week', 'Nouvelles offres cette semaine')}
          </Text>
          {dealsLoading ? (
            <View style={{ marginHorizontal: -20 }}>
              <FeedCardSkeleton colours={colours} />
              <FeedCardSkeleton colours={colours} />
            </View>
          ) : dealsError ? (
            <Text style={{ fontSize: fonts.sm, color: colours.muted, paddingVertical: 12 }}>
              {t('Could not load deals — check your connection', 'Impossible de charger les offres — verifiez votre connexion')}
            </Text>
          ) : communityDeals.length === 0 ? (
            <Text style={{ fontSize: fonts.sm, color: colours.muted, paddingVertical: 12 }}>
              {t('No deals this week', 'Aucune offre cette semaine')}
            </Text>
          ) : (
            communityDeals.slice(0, 5).map(deal => {
              const dayNames = language === 'fr' ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const isToday = deal.day_of_week === todayDow;
              const isFollowed = followedVenues.includes(deal.venue_name);
              return (
                <TouchableOpacity
                  key={deal.id}
                  activeOpacity={0.7}
                  onPress={() => addAndSave('venues', deal.venue_name, TASTE_POINTS.card_tap)}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isToday ? '#22c55e40' : colours.border, backgroundColor: isToday ? '#22c55e08' : colours.surface, marginBottom: 8 }, cardShadow]}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isToday ? '#22c55e18' : colours.tintBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="pricetag" size={16} color={isToday ? '#22c55e' : colours.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{deal.venue_name}</Text>
                    <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{deal.deal_text}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleFollowVenue(deal.venue_name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name={isFollowed ? 'heart' : 'heart-outline'}
                      size={18}
                      color={isFollowed ? '#EC4899' : colours.muted}
                    />
                  </TouchableOpacity>
                  <View style={{ backgroundColor: isToday ? '#22c55e18' : colours.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: isToday ? '#22c55e40' : colours.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? '#22c55e' : colours.muted }}>
                      {isToday ? t('TODAY', "AUJOURD'HUI") : dayNames[deal.day_of_week]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {/* Partner deals */}
          {!businessDealsLoading && businessDeals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {businessDeals.map(biz => {
                const isFollowed = followedVenues.includes(biz.business_name);
                return (
                  <TouchableOpacity
                    key={biz.id}
                    activeOpacity={0.7}
                    onPress={() => addAndSave('venues', biz.business_name, TASTE_POINTS.card_tap)}
                    style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.accent + '30', backgroundColor: colours.surface, marginBottom: 8 }, cardShadow]}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="star" size={16} color={colours.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{biz.business_name}</Text>
                      <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{biz.deal_title}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleFollowVenue(biz.business_name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name={isFollowed ? 'heart' : 'heart-outline'}
                        size={18}
                        color={isFollowed ? '#EC4899' : colours.muted}
                      />
                    </TouchableOpacity>
                    <View style={{ backgroundColor: colours.accent + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colours.accent + '30' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>
                        {t('Partner', 'Partenaire')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* List your business CTA */}
          <TouchableOpacity
            onPress={() => { setListBizDone(false); setListBizEmail(''); setListBizVisible(true); }}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }}
          >
            <Ionicons name="storefront-outline" size={16} color={colours.muted} />
            <Text style={{ flex: 1, fontSize: 12, color: colours.muted }}>
              {t('List your business — reach Ottawa riders', 'Inscrivez votre commerce — rejoignez les usagers')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colours.muted} />
          </TouchableOpacity>
        </View>

        {/* Neighbourhood Groups */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
            {t('Neighbourhood Groups', 'Groupes de quartier')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {NEIGHBOURHOOD_GROUPS.map(group => {
              const joined = joinedGroups.includes(group.id);
              return (
                <TouchableOpacity
                  key={group.id}
                  activeOpacity={0.7}
                  onPress={() => setGroupFeedGroup(group)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20,
                    borderWidth: 1,
                    borderColor: joined ? group.color : colours.border,
                    backgroundColor: joined ? group.color + '12' : colours.surface,
                  }}
                >
                  <Ionicons name={group.icon as any} size={14} color={joined ? group.color : colours.muted} />
                  <Text style={{ fontSize: 13, fontWeight: joined ? '700' : '500', color: joined ? group.color : colours.text }}>
                    {language === 'fr' ? group.name_fr : group.name_en}
                  </Text>
                  {joined && (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: group.color }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Events this weekend */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
            {t('Events This Weekend', '\u00c9v\u00e9nements ce week-end')}
          </Text>
          {eventsLoading ? (
            <View style={{ marginHorizontal: -20 }}>
              <HorizontalCardsSkeleton colours={colours} count={3} />
            </View>
          ) : eventsError ? (
            <Text style={{ fontSize: fonts.sm, color: colours.muted, paddingVertical: 12 }}>
              {t('Could not load events — check your connection', 'Impossible de charger les evenements — verifiez votre connexion')}
            </Text>
          ) : weekendEvents.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Ionicons name="calendar-outline" size={32} color={colours.muted} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                {t('No events this weekend', 'Aucun \u00e9v\u00e9nement ce weekend')}
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {sortedEvents.map(ev => {
                const now = new Date();
                const todayStr = now.toLocaleDateString('en-CA');
                const isTonightOnly = ev.date === todayStr;
                const evTimeMins = ev.time ? (() => { const [h, m] = ev.time!.split(':').map(Number); return h * 60 + m; })() : null;
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const isStartingSoon = evTimeMins !== null && evTimeMins > nowMins && evTimeMins - nowMins <= 45;
                const goingCount = rsvpCounts[ev.id] ?? 0;
                return (
                  <TouchableOpacity
                    key={ev.id}
                    activeOpacity={0.7}
                    onPress={() => ev.url && Linking.openURL(ev.url).catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel={ev.name}
                    style={[{ width: 200, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface }, cardShadow]}
                  >
                    {ev.image ? (
                      <ImageBackground source={{ uri: ev.image }} style={{ width: '100%', height: 100 }} resizeMode="cover">
                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                        <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 }}>
                          {isStartingSoon && (
                            <View style={{ backgroundColor: '#FF6B00', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{t('Starting soon', 'Bient\u00f4t')}</Text>
                            </View>
                          )}
                          {isTonightOnly && !isStartingSoon && (
                            <View style={{ backgroundColor: '#8B5CF6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{t('Tonight only', 'Ce soir seulement')}</Text>
                            </View>
                          )}
                        </View>
                        {goingCount > 0 && (
                          <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#00A78D', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{goingCount} {t('going', 'participants')}</Text>
                          </View>
                        )}
                      </ImageBackground>
                    ) : (
                      <View style={{ width: '100%', height: 100, backgroundColor: '#026CDF18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="ticket" size={28} color="#026CDF" />
                        <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 }}>
                          {isStartingSoon && (
                            <View style={{ backgroundColor: '#FF6B00', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{t('Starting soon', 'Bient\u00f4t')}</Text>
                            </View>
                          )}
                          {isTonightOnly && !isStartingSoon && (
                            <View style={{ backgroundColor: '#8B5CF6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{t('Tonight only', 'Ce soir seulement')}</Text>
                            </View>
                          )}
                        </View>
                        {goingCount > 0 && (
                          <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#00A78D', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{goingCount} {t('going', 'participants')}</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={2}>{ev.name}</Text>
                      <Text style={{ fontSize: 11, color: colours.muted, marginTop: 3 }} numberOfLines={1}>
                        {ev.venue}{ev.time ? ` · ${ev.time}` : ''}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colours.accent, marginTop: 2 }}>
                        {new Date(ev.date + 'T12:00:00').toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <RsvpButton eventId={ev.id} eventSource={ev.source} onGoing={handleEventGoing} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Latest news */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
            {t('Latest News', 'Derni\u00e8res nouvelles')}
          </Text>
          {newsArticles.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Ionicons name="newspaper-outline" size={32} color={colours.muted} style={{ marginBottom: 6 }} />
              <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
                {t('No news available', 'Aucune nouvelle disponible')}
              </Text>
            </View>
          ) : (
            newsArticles.slice(0, 5).map(article => (
              <TouchableOpacity
                key={article.id}
                onPress={() => Linking.openURL(article.link).catch(() => {})}
                style={[{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, marginBottom: 8 }, cardShadow]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={article.title}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={{ backgroundColor: '#cc3b2a18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#cc3b2a' }}>{article.source}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: colours.muted }}>{timeAgo(article.pubDate, language)}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text, lineHeight: 18 }} numberOfLines={2}>{article.title}</Text>
                </View>
                {article.thumbnail && (
                  <ImageBackground
                    source={{ uri: article.thumbnail }}
                    style={{ width: 70, height: 56, borderRadius: 8, overflow: 'hidden' }}
                    resizeMode="cover"
                  />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* List your business modal */}
      <Modal
        visible={listBizVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setListBizVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: colours.surface,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 24,
            }}>
              {/* Handle */}
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginBottom: 20 }} />

              {listBizDone ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Ionicons name="checkmark-circle" size={48} color="#22c55e" style={{ marginBottom: 12 }} />
                  <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginBottom: 8 }}>
                    {t('We got your email!', 'Nous avons votre courriel\u00a0!')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginBottom: 20 }}>
                    {t(
                      'Complete the checkout to activate your listing. You\'ll receive an onboarding link by email.',
                      'Finalisez le paiement pour activer votre inscription. Vous recevrez un lien d\'acc\u00e8s par courriel.',
                    )}
                  </Text>
                  <TouchableOpacity onPress={() => setListBizVisible(false)} style={{ paddingVertical: 12, paddingHorizontal: 28, backgroundColor: colours.accent, borderRadius: 14 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: fonts.sm }}>{t('Done', 'Termin\u00e9')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: fonts.md + 2, fontWeight: '700', color: colours.text, marginBottom: 6 }}>
                    {t('List your business', 'Inscrivez votre commerce')}
                  </Text>
                  <Text style={{ fontSize: fonts.sm, color: colours.muted, marginBottom: 20 }}>
                    {t(
                      'Reach Ottawa transit riders with a featured deal. $9.99/month — cancel anytime.',
                      'Rejoignez les usagers du transport en commun d\'Ottawa avec une offre vedette. 9,99\u00a0$/mois — annulez en tout temps.',
                    )}
                  </Text>

                  <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text, marginBottom: 6 }}>
                    {t('Your business email', 'Courriel de votre entreprise')}
                  </Text>
                  <TextInput
                    value={listBizEmail}
                    onChangeText={setListBizEmail}
                    placeholder="hello@yourbusiness.com"
                    placeholderTextColor={colours.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      borderWidth: 1, borderColor: colours.border, borderRadius: 12,
                      padding: 14, fontSize: fonts.sm, color: colours.text,
                      backgroundColor: colours.bg, marginBottom: 20,
                    }}
                  />

                  <TouchableOpacity
                    onPress={handleListBizSubmit}
                    disabled={listBizLoading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(listBizEmail.trim())}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: colours.accent, borderRadius: 14,
                      paddingVertical: 14, alignItems: 'center',
                      opacity: (listBizLoading || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(listBizEmail.trim())) ? 0.5 : 1,
                    }}
                  >
                    {listBizLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: fonts.sm }}>
                        {t('Continue to payment', 'Continuer vers le paiement')}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setListBizVisible(false)} style={{ marginTop: 14, alignItems: 'center' }}>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Cancel', 'Annuler')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <GroupFeedSheet
        group={groupFeedGroup}
        visible={!!groupFeedGroup}
        onClose={() => setGroupFeedGroup(null)}
        joinedGroups={joinedGroups}
        onJoinedGroupsChange={setJoinedGroups}
      />
    </View>
  );
}

export default function DiscoverScreen() {
  const { colours, fonts } = useApp();
  return (
    <ScreenErrorBoundary colours={colours} fonts={fonts}>
      <DiscoverScreenInner />
    </ScreenErrorBoundary>
  );
}
