import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SavedBoardItem {
  type: string;
  id?: string;
  name?: string;
}

interface Props {
  boardItems: SavedBoardItem[];
  colours: any;
  t: (en: string, fr: string) => string;
  onStopPress: (item: SavedBoardItem) => void;
}

export default function MyStopsSection({ boardItems, colours, t, onStopPress }: Props) {
  const stops = boardItems.filter(i => i.type === 'bus_stop' || i.type === 'lrt_station');
  if (stops.length === 0) return null;

  return (
    <View style={{ paddingTop: 16, paddingBottom: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 10 }}>
        {t('My Stops', 'Mes arrêts')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
        {stops.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => onStopPress(item)}
            style={{ width: 140, padding: 14, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Ionicons name={item.type === 'lrt_station' ? 'train' : 'bus'} size={14} color={colours.accent} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={2}>{(item as any).name}</Text>
            <Text style={{ fontSize: 11, color: colours.muted, marginTop: 4 }}>{t('Tap for arrivals', 'Appuyez')}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
