import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Text, TouchableOpacity, View,
} from 'react-native';

export type ServiceTile = { id: string; label_en: string; label_fr: string; icon: string; accent: string; action: 'navigate' | 'link' | 'alert'; target?: string };
export type ServicesTab = { id: string; label_en: string; label_fr: string; icon: string; tiles: ServiceTile[] };

export const SERVICES_TABS: ServicesTab[] = [
  {
    id: 'transit', label_en: 'Transit', label_fr: 'Transit', icon: 'bus',
    tiles: [
      { id: 'live_map',    label_en: 'Live Map',     label_fr: 'Carte live',    icon: 'map',              accent: '#00A78D', action: 'navigate', target: '/(tabs)/map' },
      { id: 'trip_plan',   label_en: 'Trip Planner', label_fr: 'Planificateur', icon: 'navigate',         accent: '#004890', action: 'navigate', target: '/(tabs)/planner' },
      { id: 'bikeshare',   label_en: 'Bike Share',   label_fr: 'V\u00E9los',         icon: 'bicycle',          accent: '#00A78D', action: 'alert',    target: 'bikeshare' },
      { id: 'uber',        label_en: 'Uber',         label_fr: 'Uber',          icon: 'car-sport',        accent: '#6b7f99', action: 'link',     target: 'uber://' },
      { id: 'lyft',        label_en: 'Lyft',         label_fr: 'Lyft',          icon: 'car-sport',        accent: '#FF00BF', action: 'link',     target: 'lyft://' },
    ],
  },
  {
    id: 'food', label_en: 'Food', label_fr: 'Bouffe', icon: 'restaurant',
    tiles: [
      { id: 'eats_nearby', label_en: 'Nearby Eats',  label_fr: 'Restos pr\u00E8s',   icon: 'restaurant',       accent: '#cc3b2a', action: 'navigate', target: '/(tabs)/nearby?category=restaurant' },
      { id: 'coffee',      label_en: 'Coffee',       label_fr: 'Caf\u00E9',          icon: 'cafe',             accent: '#c0852a', action: 'navigate', target: '/(tabs)/nearby?category=cafe' },
      { id: 'grocery',     label_en: 'Grocery',      label_fr: '\u00C9picerie',      icon: 'cart',             accent: '#004890', action: 'navigate', target: '/(tabs)/nearby?category=supermarket' },
    ],
  },
  {
    id: 'city', label_en: 'City', label_fr: 'Ville', icon: 'business',
    tiles: [
      { id: '311',         label_en: '311 Report',   label_fr: 'Signaler 311',  icon: 'megaphone',        accent: '#cc3b2a', action: 'alert',    target: '311' },
      { id: 'garbage',     label_en: 'Garbage Day',  label_fr: 'Collecte',      icon: 'trash',            accent: '#6b7f99', action: 'alert',    target: 'garbage' },
      { id: 'hydro',       label_en: 'Hydro Ottawa', label_fr: 'Hydro Ottawa',  icon: 'flash',            accent: '#e8a020', action: 'link',     target: 'https://hydroottawa.com/en/outages' },
      { id: 'road_511',    label_en: 'Road Events',  label_fr: '\u00C9v\u00E9nements',    icon: 'warning',          accent: '#e8a020', action: 'alert',    target: 'road_closures' },
      { id: 'parks',       label_en: 'Parks & Rinks',label_fr: 'Parcs & Patins',icon: 'snow',             accent: '#004890', action: 'alert',    target: 'parks' },
      { id: 'campus',      label_en: 'My Campus',    label_fr: 'Mon Campus',    icon: 'school',           accent: '#004890', action: 'alert',    target: 'campus' },
      { id: 'gas',         label_en: 'Gas Prices',   label_fr: 'Prix essence',  icon: 'speedometer',      accent: '#e8a020', action: 'alert',    target: 'gas_prices' },
    ],
  },
  {
    id: 'entertainment', label_en: 'Fun', label_fr: 'Divertis.', icon: 'sparkles',
    tiles: [
      { id: 'sports',      label_en: 'Ottawa Sports', label_fr: 'Sports Ottawa', icon: 'trophy-outline',   accent: '#c8102e', action: 'alert',    target: 'sports' },
      { id: 'social',      label_en: 'Social',       label_fr: 'Social',        icon: 'beer',             accent: '#7b5ea7', action: 'alert',    target: 'social' },
      { id: 'tm_events',   label_en: 'Live Events',  label_fr: '\u00C9v\u00E9nements',    icon: 'ticket',           accent: '#026CDF', action: 'navigate', target: '/(tabs)/events?source=ticketmaster' },
      { id: 'eb_events',   label_en: 'Community',    label_fr: 'Communaut\u00E9',    icon: 'people',           accent: '#F05537', action: 'navigate', target: '/(tabs)/events?source=eventbrite' },
      { id: 'reddit',      label_en: 'r/ottawa',     label_fr: 'r/ottawa',      icon: 'chatbubbles',      accent: '#FF4500', action: 'link',     target: 'https://www.reddit.com/r/ottawa/' },
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

export default function ServicesGrid({ colours, fonts, t, language, activeTab, onTabChange, onTileTap, cardShadow }: ServicesGridProps) {
  const currentTab = SERVICES_TABS.find(t => t.id === activeTab) || SERVICES_TABS[0];
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 6, marginBottom: 10 }}>
        {SERVICES_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (<TouchableOpacity key={tab.id} onPress={() => onTabChange(tab.id)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, height: 32, borderRadius: 16, borderWidth: 1, backgroundColor: active ? colours.accent : colours.surface, borderColor: active ? colours.accent : colours.border }} accessibilityRole="tab" accessibilityLabel={language === 'fr' ? tab.label_fr : tab.label_en} accessibilityState={{ selected: active }}><Ionicons name={tab.icon as any} size={12} color={active ? 'white' : colours.muted} /><Text style={{ fontSize: fonts.sm, fontWeight: '700', color: active ? 'white' : colours.muted }}>{language === 'fr' ? tab.label_fr : tab.label_en}</Text></TouchableOpacity>);
        })}
      </View>
      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        {Array.from({ length: Math.ceil(currentTab.tiles.length / 4) }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 8, marginBottom: row < Math.ceil(currentTab.tiles.length / 4) - 1 ? 8 : 0 }}>
            {currentTab.tiles.slice(row * 4, row * 4 + 4).map(tile => (
                <TouchableOpacity key={tile.id} onPress={() => onTileTap(tile)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, borderTopWidth: 2, borderTopColor: tile.accent, paddingVertical: 12, paddingHorizontal: 4, ...cardShadow }} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={language === 'fr' ? tile.label_fr : tile.label_en}>
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
