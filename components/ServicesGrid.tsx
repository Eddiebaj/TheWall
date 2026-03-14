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
      { id: 'parkride',    label_en: 'Park & Ride',  label_fr: 'Parc-o-Bus',    icon: 'car',              accent: '#6b7f99', action: 'link',     target: 'https://www.octranspo.com/en/plan-your-trip/service-information/park-and-ride/' },
      { id: 'paybyphone',  label_en: 'PayByPhone',   label_fr: 'PayByPhone',    icon: 'phone-portrait',   accent: '#004890', action: 'link',     target: 'https://www.paybyphone.com/parking/ottawa' },
      { id: 'uber',        label_en: 'Uber',         label_fr: 'Uber',          icon: 'car-sport',        accent: '#6b7f99', action: 'link',     target: 'uber://' },
      { id: 'lyft',        label_en: 'Lyft',         label_fr: 'Lyft',          icon: 'car-sport',        accent: '#FF00BF', action: 'link',     target: 'lyft://' },
      { id: 'presto',     label_en: 'Presto Card',  label_fr: 'Carte Presto',  icon: 'card',             accent: '#00A78D', action: 'link',     target: 'https://www.prestocard.ca/en' },
      { id: 'construction',label_en: 'Construction', label_fr: 'Construction',  icon: 'construct',        accent: '#e8a020', action: 'link',     target: 'https://traffic.ottawa.ca' },
      { id: 'para',        label_en: 'Para Transpo', label_fr: 'Para Transpo', icon: 'accessibility',    accent: '#7b5ea7', action: 'alert',    target: 'para_transpo' },
    ],
  },
  {
    id: 'food', label_en: 'Food', label_fr: 'Bouffe', icon: 'restaurant',
    tiles: [
      { id: 'eats_nearby', label_en: 'Nearby Eats',  label_fr: 'Restos pr\u00E8s',   icon: 'restaurant',       accent: '#cc3b2a', action: 'navigate', target: '/(tabs)/nearby?category=restaurant' },
      { id: 'coffee',      label_en: 'Coffee',       label_fr: 'Caf\u00E9',          icon: 'cafe',             accent: '#c0852a', action: 'navigate', target: '/(tabs)/nearby?category=cafe' },
      { id: 'skip',        label_en: 'Skip',         label_fr: 'Skip',          icon: 'bicycle',          accent: '#ff6a00', action: 'link',     target: 'skipthedishes://' },
      { id: 'ubereats',    label_en: 'Uber Eats',    label_fr: 'Uber Eats',     icon: 'fast-food',        accent: '#06C167', action: 'link',     target: 'ubereats://' },
      { id: 'doordash',    label_en: 'DoorDash',     label_fr: 'DoorDash',      icon: 'bag-handle',       accent: '#FF3008', action: 'link',     target: 'doordash://' },
      { id: 'grocery',     label_en: 'Grocery',      label_fr: '\u00C9picerie',      icon: 'cart',             accent: '#004890', action: 'navigate', target: '/(tabs)/nearby?category=supermarket' },
      { id: 'lcbo',        label_en: 'LCBO Hours',   label_fr: 'LCBO',          icon: 'wine',             accent: '#7b5ea7', action: 'link',     target: 'https://www.lcbo.com/en/stores' },
      { id: 'byward',      label_en: 'ByWard Mkt',   label_fr: 'March\u00E9 ByWard', icon: 'storefront',       accent: '#c0852a', action: 'link',     target: 'https://byward-market.com' },
    ],
  },
  {
    id: 'city', label_en: 'City', label_fr: 'Ville', icon: 'business',
    tiles: [
      { id: '311',         label_en: '311 Report',   label_fr: 'Signaler 311',  icon: 'megaphone',        accent: '#cc3b2a', action: 'alert',    target: '311' },
      { id: 'garbage',     label_en: 'Garbage Day',  label_fr: 'Collecte',      icon: 'trash',            accent: '#6b7f99', action: 'alert',    target: 'garbage' },
      { id: 'hydro',       label_en: 'Hydro Ottawa', label_fr: 'Hydro Ottawa',  icon: 'flash',            accent: '#e8a020', action: 'link',     target: 'https://hydroottawa.com/en/outages' },
      { id: 'parking',     label_en: 'Parking',      label_fr: 'Stationnement', icon: 'car',              accent: '#004890', action: 'alert',    target: 'parking' },
      { id: 'parking_tkt', label_en: 'Pay Ticket',   label_fr: 'Payer contrav.', icon: 'card',            accent: '#cc3b2a', action: 'link',     target: 'https://www.ottawapolice.ca/en/parking-and-traffic/pay-a-parking-ticket.aspx' },
      { id: 'road_511',    label_en: 'Road Events',  label_fr: '\u00C9v\u00E9nements',    icon: 'warning',          accent: '#e8a020', action: 'alert',    target: 'road_closures' },
      { id: 'parks',       label_en: 'Parks & Rinks',label_fr: 'Parcs & Patins',icon: 'snow',             accent: '#004890', action: 'alert',    target: 'parks' },
      { id: 'library',     label_en: 'OPL Library',  label_fr: 'Bib. Ottawa',   icon: 'book',             accent: '#004890', action: 'link',     target: 'https://biblioottawalibrary.ca' },
      { id: 'walkin',      label_en: 'Walk-In Clinic',label_fr: 'Clinique',     icon: 'medical',          accent: '#00A78D', action: 'link',     target: 'https://www.ontario.ca/page/find-walk-in-clinic' },
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
      { id: 'nac',         label_en: 'NAC',          label_fr: 'CNA',           icon: 'musical-notes',    accent: '#c0852a', action: 'link',     target: 'https://nac-cna.ca' },
      { id: 'bluesfest',   label_en: 'Bluesfest',    label_fr: 'Bluesfest',     icon: 'mic',              accent: '#004890', action: 'link',     target: 'https://ottawabluesfest.ca' },
      { id: 'cineplex',    label_en: 'Cineplex',     label_fr: 'Cineplex',      icon: 'film',             accent: '#cc3b2a', action: 'link',     target: 'https://www.cineplex.com' },
      { id: 'casino',      label_en: 'Casino',       label_fr: 'Casino',        icon: 'diamond',          accent: '#e8a020', action: 'link',     target: 'https://www.casicolacite.com/en/' },
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
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
        {SERVICES_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (<TouchableOpacity key={tab.id} onPress={() => onTabChange(tab.id)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: active ? colours.accent : colours.surface, borderColor: active ? colours.accent : colours.border }} accessibilityRole="tab" accessibilityLabel={language === 'fr' ? tab.label_fr : tab.label_en} accessibilityState={{ selected: active }}><Ionicons name={tab.icon as any} size={13} color={active ? 'white' : colours.muted} /><Text style={{ fontSize: fonts.sm, fontWeight: '700', color: active ? 'white' : colours.muted }}>{language === 'fr' ? tab.label_fr : tab.label_en}</Text></TouchableOpacity>);
        })}
      </View>
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        {Array.from({ length: Math.ceil(currentTab.tiles.length / 4) }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 10, marginBottom: row < Math.ceil(currentTab.tiles.length / 4) - 1 ? 10 : 0 }}>
            {currentTab.tiles.slice(row * 4, row * 4 + 4).map(tile => (
                <TouchableOpacity key={tile.id} onPress={() => onTileTap(tile)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, borderTopWidth: 3, borderTopColor: tile.accent, paddingVertical: 14, paddingHorizontal: 4, ...cardShadow }} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={language === 'fr' ? tile.label_fr : tile.label_en}>
                  <Ionicons name={tile.icon as any} size={22} color={tile.accent} />
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colours.text, textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>{language === 'fr' ? tile.label_fr : tile.label_en}</Text>
                </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
