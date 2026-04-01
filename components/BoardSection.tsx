import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedBoardCard } from './SavedCards';
import { SavedBoardItem } from '../lib/homeConstants';
import { CampusConfig } from '../lib/campusData';

export interface BoardSectionProps {
  savedBoard: SavedBoardItem[];
  onReorder: (from: number, to: number) => void;
  onCardPress: (item: SavedBoardItem) => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  cardShadow: any;
  garbageEvents: { date: string; flags: string[] }[];
  alerts: any[];
  sensGame?: { state: 'live' | 'pre' | 'none'; period?: string; homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number; startTime?: string; opponentAbbr?: string } | null;
  timeFormat?: 'relative' | 'absolute';
  campusData?: CampusConfig | null;
}

function keyExtractor(item: SavedBoardItem, i: number): string {
  if (item.type === 'garbage') return 'garbage';
  if (item.type === 'service_alert') return 'service_alert';
  if (item.type === 'gas_prices') return 'gas_prices';
  if (item.type === 'otrain') return 'otrain';
  if (item.type === 'services') return 'services';
  if (item.type === 'discover') return 'discover';
  if (item.type === 'news') return 'news';
  if (item.type === 'neighbourhood') return `neighbourhood-${item.id}`;
  if (item.type === 'campus') return 'campus';
  if (item.type === 'saved_team') return `team-${item.id}`;
  if (item.type === 'external_link') return `ext-${item.id}`;
  return `${item.type}-${(item as any).id}-${i}`;
}

export function BoardSection({
  savedBoard, onReorder, onCardPress,
  colours, fonts, t, cardShadow,
  garbageEvents, alerts, sensGame, timeFormat, campusData,
}: BoardSectionProps) {
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, letterSpacing: 1 }}>{t('My Board', 'Mon tableau')}</Text>
        <Ionicons name="reorder-three-outline" size={16} color={colours.muted} />
      </View>
      <FlatList
        horizontal
        data={savedBoard}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 4 }}
        style={{ marginBottom: 16 }}
        renderItem={({ item, index: idx }) => (
          <SavedBoardCard
            item={item}
            drag={() => {}}
            isActive={false}
            colours={colours}
            fonts={fonts}
            t={t}
            cardShadow={cardShadow}
            garbageEvents={garbageEvents}
            alerts={alerts}
            sensGame={sensGame}
            timeFormat={timeFormat}
            campusData={campusData}
            onMoveLeft={idx > 0 ? () => onReorder(idx, idx - 1) : undefined}
            onMoveRight={idx < savedBoard.length - 1 ? () => onReorder(idx, idx + 1) : undefined}
            onPress={() => onCardPress(item)}
          />
        )}
      />
    </>
  );
}
