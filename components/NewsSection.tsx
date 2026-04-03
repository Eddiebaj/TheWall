import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch {}
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, ImageBackground, Linking, RefreshControl, ScrollView,
  Share, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { NewsArticle, SOURCE_COLOURS, SOURCE_FALLBACK_ICONS, SOURCE_LOGOS, timeAgo } from '../lib/newsData';
import { SK_NEWS_CACHE, SK_SAVED_ARTICLES } from '../lib/storageKeys';

const NEWS_URL = 'https://routeo-backend.vercel.app/api/news';
const REFRESH_MS = 15 * 60 * 1000;

function decodeEntities(s: string): string {
  return s.replace(/&#124;/g, '|').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export type SortMode = 'latest' | 'oldest' | 'source';

type Props = {
  colours: any;
  fonts: any;
  cardShadow: any;
  onArticlesLoaded?: (articles: NewsArticle[]) => void;
  sortMode?: SortMode;
  sourceFilter?: string | null;
};

function NewsSection({ colours, fonts, cardShadow, onArticlesLoaded, sortMode = 'latest', sourceFilter }: Props) {
  const { t, language } = useApp();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(20);

  // Reset visible count when sort/filter changes
  useEffect(() => { setVisibleCount(20); }, [sortMode, sourceFilter]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const onArticlesLoadedRef = useRef(onArticlesLoaded);
  useEffect(() => { onArticlesLoadedRef.current = onArticlesLoaded; }, [onArticlesLoaded]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
    });
    return () => sub.remove();
  }, []);

  const isValidImageUrl = (url: string | undefined): url is string =>
    typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));

  useEffect(() => {
    AsyncStorage.getItem(SK_SAVED_ARTICLES).then(val => {
      if (val) try { setSavedIds(new Set(JSON.parse(val))); } catch (e) { if (__DEV__) console.warn(e); }
    });
  }, []);

  const toggleSave = (id: string) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      AsyncStorage.setItem(SK_SAVED_ARTICLES, JSON.stringify([...next]));
      return next;
    });
  };

  const shareArticle = (article: NewsArticle) => {
    Share.share({ message: `${decodeEntities(article.title)}\n${article.link}`, url: article.link });
  };

  const fetchNews = async (isManualRefresh = false) => {
    try {
      const resp = await fetchWithTimeout(NEWS_URL);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const items: NewsArticle[] = data.articles || [];
      if (__DEV__) console.log('News fetched:', items.length, 'articles');
      setArticles(items);
      onArticlesLoadedRef.current?.(items);
      AsyncStorage.setItem(SK_NEWS_CACHE, JSON.stringify({ articles: items, ts: Date.now() }));
    } catch (e) {
      if (__DEV__) console.warn('fetch news failed:', e);
      // Try cache only if not manual refresh (user expects fresh data)
      if (!isManualRefresh) {
        try {
          const cached = await AsyncStorage.getItem(SK_NEWS_CACHE);
          if (cached) {
            const parsed = JSON.parse(cached);
            setArticles(parsed.articles || []);
            onArticlesLoadedRef.current?.(parsed.articles || []);
          }
        } catch (e) { if (__DEV__) console.warn(e); }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNews(true);
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    // Load from cache first, then fetch
    AsyncStorage.getItem(SK_NEWS_CACHE).then(val => {
      if (!mountedRef.current) return;
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (parsed.articles?.length) {
            setArticles(parsed.articles);
            onArticlesLoaded?.(parsed.articles);
            setLoading(false);
            // If cache is fresh enough, skip immediate fetch
            if (parsed.ts && Date.now() - parsed.ts < REFRESH_MS) return;
          }
        } catch (e) { if (__DEV__) console.warn(e); }
      }
      fetchNews();
    });

    intervalRef.current = setInterval(() => {
      if (appStateRef.current === 'active') fetchNews();
    }, REFRESH_MS);
    return () => { mountedRef.current = false; if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading && articles.length === 0) {
    return (
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        {[0, 1].map(i => (
          <View key={i} style={{ height: 160, borderRadius: 12, backgroundColor: colours.border, marginBottom: 10, opacity: 0.4 - i * 0.15 }} />
        ))}
      </View>
    );
  }

  if (articles.length === 0) {
    return (
      <View style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' }}>
        <Ionicons name="newspaper-outline" size={28} color={colours.muted} />
        <Text style={{ color: colours.muted, fontSize: fonts.sm, marginTop: 6 }}>{t('No news available', 'Aucune nouvelle disponible')}</Text>
        <TouchableOpacity onPress={onRefresh} style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.tintBg }}>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Retry', 'Réessayer')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (__DEV__) console.log('articles.length:', articles.length, 'visibleCount:', visibleCount);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ color: colours.muted, fontSize: fonts.sm }}>{t('Local News', 'Nouvelles locales')}</Text>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {refreshing
            ? <ActivityIndicator color={colours.accent} size="small" />
            : <Ionicons name="refresh" size={16} color={colours.muted} />
          }
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        {(() => {
          let sorted = [...articles];
          if (sourceFilter) sorted = sorted.filter(a => a.source === sourceFilter);
          if (sortMode === 'oldest') sorted.sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());
          else if (sortMode === 'source') sorted.sort((a, b) => a.source.localeCompare(b.source));
          else sorted.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
          return sorted.slice(0, visibleCount);
        })().map(article => {
          const sourceColour = SOURCE_COLOURS[article.source] || colours.accent;
          const fallbackIcon = SOURCE_FALLBACK_ICONS[article.source] || 'newspaper-outline';
          const hasImage = isValidImageUrl(article.thumbnail) && !failedImages.has(article.id);
          return (
            <TouchableOpacity
              key={article.id}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(article.link)}
              style={[{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: colours.surface,
                borderWidth: 1,
                borderColor: colours.border,
              }, cardShadow]}
            >
              {hasImage ? (
                <ImageBackground
                  source={{ uri: article.thumbnail }}
                  onError={() => setFailedImages(prev => new Set(prev).add(article.id))}
                  style={{ width: '100%', height: 160, justifyContent: 'flex-end' }}
                  resizeMode="cover"
                >
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
                  {/* Source badge */}
                  <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: sourceColour, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{article.source}</Text>
                  </View>
                  {/* Time ago */}
                  <View style={{ position: 'absolute', top: 8, right: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{timeAgo(article.pubDate, language)}</Text>
                  </View>
                  {/* Headline + actions */}
                  <View style={{ padding: 12 }}>
                    <Text
                      numberOfLines={2}
                      style={{
                        color: '#fff',
                        fontSize: fonts.md,
                        fontWeight: '700',
                        lineHeight: 20,
                        textShadowColor: 'rgba(0,0,0,0.6)',
                        textShadowRadius: 4,
                      }}
                    >
                      {decodeEntities(article.title)}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                      <TouchableOpacity onPress={() => toggleSave(article.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name={savedIds.has(article.id) ? 'bookmark' : 'bookmark-outline'} size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => shareArticle(article)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="share-outline" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </ImageBackground>
              ) : (
                <View>
                  {/* Fallback: outlet name centered */}
                  <View style={{ height: 100, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, color: colours.muted }}>{article.source}</Text>
                  </View>
                  {/* Source badge */}
                  <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: sourceColour, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{article.source}</Text>
                  </View>
                  {/* Time ago */}
                  <View style={{ position: 'absolute', top: 8, right: 8 }}>
                    <Text style={{ color: colours.muted, fontSize: 10, fontWeight: '700' }}>{timeAgo(article.pubDate, language)}</Text>
                  </View>
                  {/* Headline + actions */}
                  <View style={{ padding: 12 }}>
                    <Text
                      numberOfLines={2}
                      style={{
                        color: colours.text,
                        fontSize: fonts.md,
                        fontWeight: '700',
                        lineHeight: 20,
                      }}
                    >
                      {decodeEntities(article.title)}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                      <TouchableOpacity onPress={() => toggleSave(article.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name={savedIds.has(article.id) ? 'bookmark' : 'bookmark-outline'} size={16} color={colours.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => shareArticle(article)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="share-outline" size={16} color={colours.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {(() => {
          let total = sourceFilter ? articles.filter(a => a.source === sourceFilter).length : articles.length;
          if (visibleCount < total) return (
            <TouchableOpacity
              onPress={() => setVisibleCount(prev => prev + 20)}
              style={{ alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colours.accent + '40', backgroundColor: colours.tintBg, marginTop: 4 }}
            >
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Load more', 'Charger plus')}</Text>
            </TouchableOpacity>
          );
          return null;
        })()}
      </View>

    </View>
  );
}

export default React.memo(NewsSection);
