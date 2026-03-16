import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView, StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import NewsSection, { SortMode } from '../../components/NewsSection';
import { NewsArticle, SOURCE_COLOURS } from '../../lib/newsData';

export default function SavedScreen() {
  const { colours, theme, t, fonts } = useApp();
  const isLight = theme === 'light';

  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);

  const onArticlesLoaded = useCallback((articles: NewsArticle[]) => {
    const unique = [...new Set(articles.map(a => a.source))].sort();
    setSources(unique);
  }, []);

  const cardShadow = isLight ? {
    shadowColor: '#004890',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  } : {};

  const sortOptions: { id: SortMode; label_en: string; label_fr: string }[] = [
    { id: 'latest', label_en: 'Latest', label_fr: 'Recents' },
    { id: 'oldest', label_en: 'Oldest', label_fr: 'Anciens' },
    { id: 'source', label_en: 'Source A-Z', label_fr: 'Source A-Z' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
          Route<Text style={{ color: colours.accent }}>O</Text>
        </Text>
        <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
          {t('LOCAL NEWS', 'NOUVELLES LOCALES')}
        </Text>
      </View>

      {/* Sort pills */}
      <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {sortOptions.map(opt => {
            const active = sortMode === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setSortMode(opt.id)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: active ? colours.accent + '18' : colours.surface,
                  borderWidth: 1, borderColor: active ? colours.accent + '40' : colours.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? colours.accent : colours.muted }}>
                  {t(opt.label_en, opt.label_fr)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Source filter pills */}
      {sources.length > 0 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              onPress={() => setSourceFilter(null)}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: !sourceFilter ? colours.accent + '18' : colours.surface,
                borderWidth: 1, borderColor: !sourceFilter ? colours.accent + '40' : colours.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: !sourceFilter ? colours.accent : colours.muted }}>
                {t('All', 'Tous')}
              </Text>
            </TouchableOpacity>
            {sources.map(src => {
              const active = sourceFilter === src;
              const srcColour = SOURCE_COLOURS[src] || colours.accent;
              return (
                <TouchableOpacity
                  key={src}
                  onPress={() => setSourceFilter(active ? null : src)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                    backgroundColor: active ? srcColour + '18' : colours.surface,
                    borderWidth: 1, borderColor: active ? srcColour + '40' : colours.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? srcColour : colours.muted }}>
                    {src}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <NewsSection
          colours={colours}
          fonts={fonts}
          cardShadow={cardShadow}
          onArticlesLoaded={onArticlesLoaded}
          sortMode={sortMode}
          sourceFilter={sourceFilter}
        />
      </ScrollView>
    </View>
  );
}
