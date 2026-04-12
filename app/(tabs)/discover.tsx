import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ImageBackground, Linking, RefreshControl, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { cardShadow as sharedCardShadow } from '../../lib/styles';
import { NewsArticle, timeAgo } from '../../lib/newsData';
import { SK_NEWS_CACHE } from '../../lib/storageKeys';
import { supabase } from '../../lib/supabase';
import { ScreenErrorBoundary } from '../../components/ScreenErrorBoundary';
import { FeedCardSkeleton, HorizontalCardsSkeleton } from '../../components/Shimmer';
import { useIsPremium } from '../../lib/premium';
import { PREMIUM_ENABLED } from '../../lib/flags';

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
};

function DiscoverScreenInner() {
  const { colours, theme, resolvedTheme, t, fonts, language } = useApp();
  const isLight = resolvedTheme === 'light';
  const insets = useSafeAreaInsets();
  const isPremium = useIsPremium();

  const cardShadow = isLight ? sharedCardShadow : {};

  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [allCommunityDeals, setAllCommunityDeals] = useState<CommunityDeal[]>([]);
  // Filter out early_access deals for non-premium users when the flag is active
  const communityDeals = (PREMIUM_ENABLED && !isPremium)
    ? allCommunityDeals.filter(d => !d.early_access)
    : allCommunityDeals;
  const [weekendEvents, setWeekendEvents] = useState<WeekendEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
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
  }, []);

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
      const resp = await fetchWithTimeout(`https://routeo-backend.vercel.app/api/ebevents?action=ticketmaster&city=Ottawa&radius=50&size=50`);
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
        }));
        setWeekendEvents(evs);
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
              return (
                <View
                  key={deal.id}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isToday ? '#22c55e' + '40' : colours.border, backgroundColor: isToday ? '#22c55e08' : colours.surface, marginBottom: 8 }, cardShadow]}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isToday ? '#22c55e' + '18' : colours.tintBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="pricetag" size={16} color={isToday ? '#22c55e' : colours.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{deal.venue_name}</Text>
                    <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }} numberOfLines={1}>{deal.deal_text}</Text>
                  </View>
                  <View style={{ backgroundColor: isToday ? '#22c55e' + '18' : colours.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: isToday ? '#22c55e' + '40' : colours.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? '#22c55e' : colours.muted }}>
                      {isToday ? t('TODAY', 'AUJOURD\'HUI') : dayNames[deal.day_of_week]}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
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
              {weekendEvents.map(ev => (
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
                    </ImageBackground>
                  ) : (
                    <View style={{ width: '100%', height: 100, backgroundColor: '#026CDF18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="ticket" size={28} color="#026CDF" />
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
                </TouchableOpacity>
              ))}
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
