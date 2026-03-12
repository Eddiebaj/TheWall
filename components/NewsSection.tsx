import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ImageBackground, Linking, ScrollView,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { NewsArticle, SOURCE_COLOURS, timeAgo } from '../lib/newsData';
import { SK_NEWS_CACHE } from '../lib/storageKeys';

const NEWS_URL = 'https://routeo-backend.vercel.app/api/news';
const REFRESH_MS = 15 * 60 * 1000;

type Props = {
  colours: any;
  fonts: any;
  cardShadow: any;
  onArticlesLoaded?: (articles: NewsArticle[]) => void;
};

export default function NewsSection({ colours, fonts, cardShadow, onArticlesLoaded }: Props) {
  const { t, language } = useApp();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNews = async () => {
    try {
      const resp = await fetchWithTimeout(NEWS_URL);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const items: NewsArticle[] = data.articles || [];
      setArticles(items);
      onArticlesLoaded?.(items);
      AsyncStorage.setItem(SK_NEWS_CACHE, JSON.stringify({ articles: items, ts: Date.now() }));
    } catch (e) {
      if (__DEV__) console.warn('fetch news failed:', e);
      // Try cache
      try {
        const cached = await AsyncStorage.getItem(SK_NEWS_CACHE);
        if (cached) {
          const parsed = JSON.parse(cached);
          setArticles(parsed.articles || []);
          onArticlesLoaded?.(parsed.articles || []);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load from cache first, then fetch
    AsyncStorage.getItem(SK_NEWS_CACHE).then(val => {
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
        } catch {}
      }
      fetchNews();
    });

    intervalRef.current = setInterval(fetchNews, REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading && articles.length === 0) {
    return (
      <View style={{ paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center' }}>
        <ActivityIndicator color={colours.accent} />
      </View>
    );
  }

  if (articles.length === 0) return null;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ color: colours.muted, fontSize: fonts.sm }}>{t('Local News', 'Nouvelles locales')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingRight: 20, gap: 12, paddingBottom: 4 }}>
        {articles.slice(0, 8).map(article => {
          const sourceColour = SOURCE_COLOURS[article.source] || colours.accent;
          return (
            <TouchableOpacity
              key={article.id}
              activeOpacity={0.92}
              onPress={() => Linking.openURL(article.link)}
              style={[{
                width: 200,
                height: 160,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: colours.surface,
                borderWidth: 1,
                borderColor: colours.border,
              }, cardShadow]}
            >
              <ImageBackground
                source={article.thumbnail ? { uri: article.thumbnail } : undefined}
                style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }}
                resizeMode="cover"
              >
                {!article.thumbnail && (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: sourceColour + '15' }}>
                    <Ionicons name="newspaper-outline" size={32} color={sourceColour} />
                  </View>
                )}
                {article.thumbnail && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
                )}
                {/* Source badge */}
                <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: sourceColour, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 }}>{article.source}</Text>
                </View>
                {/* Time ago */}
                <View style={{ position: 'absolute', top: 8, right: 8 }}>
                  <Text style={{ color: article.thumbnail ? '#fff' : colours.muted, fontSize: 10, fontWeight: '700' }}>{timeAgo(article.pubDate, language)}</Text>
                </View>
                {/* Headline */}
                <View style={{ padding: 10 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: article.thumbnail ? '#fff' : colours.text,
                      fontSize: fonts.md,
                      fontWeight: '800',
                      lineHeight: 18,
                      ...(article.thumbnail ? { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 } : {}),
                    }}
                  >
                    {article.title}
                  </Text>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
