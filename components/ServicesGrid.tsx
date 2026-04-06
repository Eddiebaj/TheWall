import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Text, TouchableOpacity, View,
} from 'react-native';

export type ServiceTile = { id: string; label_en: string; label_fr: string; icon: string; accent: string; action: 'navigate' | 'link' | 'alert'; target?: string };
export type ServicesTab = { id: string; label_en: string; label_fr: string; icon: string; tiles: ServiceTile[] };

export const SERVICES_TABS: ServicesTab[] = [
  {
    id: 'explore', label_en: 'Explore', label_fr: 'Explorer', icon: 'compass',
    tiles: [
      { id: 'sports',      label_en: 'Sports',       label_fr: 'Sports',        icon: 'trophy-outline',   accent: '#c8102e', action: 'alert',    target: 'sports' },
      { id: 'social',      label_en: 'Social',       label_fr: 'Social',        icon: 'beer',             accent: '#7b5ea7', action: 'alert',    target: 'social' },
      { id: 'tm_events',   label_en: 'Events',       label_fr: '\u00C9v\u00E9nements',    icon: 'ticket',           accent: '#026CDF', action: 'navigate', target: '/(tabs)/events?source=ticketmaster' },
      { id: 'eats_nearby', label_en: 'Eats',         label_fr: 'Restos',        icon: 'restaurant',       accent: '#cc3b2a', action: 'navigate', target: '/(tabs)/nearby?category=restaurant' },
      { id: 'coffee',      label_en: 'Coffee',       label_fr: 'Caf\u00E9',          icon: 'cafe',             accent: '#c0852a', action: 'navigate', target: '/(tabs)/nearby?category=cafe' },
    ],
  },
  {
    id: 'city', label_en: 'City', label_fr: 'Ville', icon: 'business',
    tiles: [
      { id: 'bikeshare',   label_en: 'Bike Share',   label_fr: 'V\u00E9los',         icon: 'bicycle',          accent: '#00A78D', action: 'alert',    target: 'bikeshare' },
      { id: '311',         label_en: '311',           label_fr: '311',            icon: 'megaphone',        accent: '#cc3b2a', action: 'alert',    target: '311' },
      { id: 'garbage',     label_en: 'Garbage',      label_fr: 'Collecte',      icon: 'trash',            accent: '#6b7f99', action: 'alert',    target: 'garbage' },
      { id: 'campus',      label_en: 'Campus',       label_fr: 'Campus',        icon: 'school',           accent: '#004890', action: 'alert',    target: 'campus' },
      { id: 'parks',       label_en: 'Parks',        label_fr: 'Parcs',         icon: 'leaf',             accent: '#004890', action: 'alert',    target: 'parks' },
    ],
  },
];

type ServicesGridProps = {
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onTileTap: (tile: ServiceTile) => void;
  cardShadow: any;
};

function ServicesGrid({ colours, fonts, t, language, activeTab, onTabChange, onTileTap, cardShadow }: ServicesGridProps) {
  const currentTab = SERVICES_TABS.find(tab => tab.id === activeTab) || SERVICES_TABS[0];
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 6, marginBottom: 10 }}>
        {SERVICES_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                paddingHorizontal: 16, height: 32, borderRadius: 16, borderWidth: 1,
                backgroundColor: active ? colours.accent : 'transparent',
                borderColor: active ? colours.accent : colours.border,
              }}
              accessibilityRole="tab"
              accessibilityLabel={language === 'fr' ? tab.label_fr : tab.label_en}
              accessibilityState={{ selected: active }}>
              <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: active ? 'white' : colours.muted }}>
                {language === 'fr' ? tab.label_fr : tab.label_en}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        {Array.from({ length: Math.ceil(currentTab.tiles.length / 4) }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 8, marginBottom: row < Math.ceil(currentTab.tiles.length / 4) - 1 ? 8 : 0 }}>
            {currentTab.tiles.slice(row * 4, row * 4 + 4).map(tile => (
                <TouchableOpacity key={tile.id} onPress={() => onTileTap(tile)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingVertical: 12, paddingHorizontal: 4, ...cardShadow }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={language === 'fr' ? tile.label_fr : tile.label_en}>
                  <Ionicons name={tile.icon as any} size={20} color={tile.accent} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.text, textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>{language === 'fr' ? tile.label_fr : tile.label_en}</Text>
                </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default React.memo(ServicesGrid);
