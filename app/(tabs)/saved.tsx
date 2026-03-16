import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  RefreshControl, ScrollView, StatusBar, Text, View
} from 'react-native';
import { useApp } from '../../context/AppContext';
import NewsSection from '../../components/NewsSection';

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

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
          Route<Text style={{ color: colours.accent }}>O</Text>
        </Text>
        <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
          {t('LOCAL NEWS', 'NOUVELLES LOCALES')}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <NewsSection colours={colours} fonts={fonts} cardShadow={cardShadow} />
      </ScrollView>
    </View>
  );
}
