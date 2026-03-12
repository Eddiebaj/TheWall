import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ImageBackground, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { Neighbourhood, NEIGHBOURHOODS } from '../../lib/neighbourhoodData';
import { NewsArticle } from '../../lib/newsData';
import { SK_NEWS_CACHE, SK_SAVED_NEIGHBOURHOODS } from '../../lib/storageKeys';
import NeighbourhoodSheet from '../../components/NeighbourhoodSheet';

export default function DiscoverScreen() {
  const { colours, theme, t, fonts, language } = useApp();
  const isLight = theme === 'light';

  const cardShadow = isLight ? {
    shadowColor: '#004890',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  } : {};

  const [search, setSearch] = useState('');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Neighbourhood | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SK_SAVED_NEIGHBOURHOODS).then(val => {
      if (val) { try { setSavedIds(JSON.parse(val)); } catch {} }
    });
    AsyncStorage.getItem(SK_NEWS_CACHE).then(val => {
      if (val) { try { setNewsArticles(JSON.parse(val).articles || []); } catch {} }
    });
  }, []);

  const toggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      AsyncStorage.setItem(SK_SAVED_NEIGHBOURHOODS, JSON.stringify(next));
      return next;
    });
  };

  const filtered = NEIGHBOURHOODS.filter(n => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return n.name_en.toLowerCase().includes(q) || n.name_fr.toLowerCase().includes(q) || n.keywords.some(kw => kw.includes(q));
  });

  // Sort: saved first
  const sorted = [...filtered].sort((a, b) => {
    const as = savedIds.includes(a.id) ? 0 : 1;
    const bs = savedIds.includes(b.id) ? 0 : 1;
    return as - bs;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
          Route<Text style={{ color: colours.accent }}>O</Text>
        </Text>
        <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
          {t('NEIGHBOURHOODS', 'QUARTIERS')}
        </Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 14, paddingHorizontal: 14 }}>
          <Ionicons name="search" size={16} color={colours.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('Search neighbourhoods...', 'Rechercher des quartiers...')}
            placeholderTextColor={colours.muted}
            style={{ flex: 1, paddingVertical: 12, paddingLeft: 8, fontSize: fonts.md, color: colours.text, fontWeight: '500' }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colours.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {sorted.length} {t('neighbourhoods', 'quartiers')}
        </Text>

        {sorted.map(n => {
          const name = language === 'fr' ? n.name_fr : n.name_en;
          const desc = language === 'fr' ? n.description_fr : n.description_en;
          const isSaved = savedIds.includes(n.id);

          return (
            <TouchableOpacity
              key={n.id}
              activeOpacity={0.92}
              onPress={() => { setSelected(n); setSheetVisible(true); }}
              style={[{
                borderRadius: 16,
                overflow: 'hidden',
                marginBottom: 14,
                height: 160,
                backgroundColor: colours.surface,
                borderWidth: 1,
                borderColor: colours.border,
              }, cardShadow]}
            >
              <ImageBackground
                source={{ uri: n.photoUrl }}
                style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }}
                resizeMode="cover"
              >
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                {/* Save toggle */}
                <TouchableOpacity
                  onPress={() => toggleSave(n.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color="#fff" />
                </TouchableOpacity>
                {/* Content */}
                <View style={{ padding: 14 }}>
                  <Text style={{ color: '#fff', fontSize: fonts.lg, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>{name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fonts.sm, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3 }} numberOfLines={2}>{desc}</Text>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <NeighbourhoodSheet
        visible={sheetVisible}
        neighbourhood={selected}
        onClose={() => setSheetVisible(false)}
        colours={colours}
        fonts={fonts}
        events={[]}
        newsArticles={newsArticles}
      />
    </View>
  );
}
