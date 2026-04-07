import React from 'react';
import { View, Text, TouchableOpacity, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapPin, LAYER_CONFIG, LAYER_ICONS } from '../lib/mapLayers';
import { useApp } from '../context/AppContext';

interface LayerFeedCardProps {
  pin: MapPin;
  onRoute: (pin: MapPin) => void;
  onSave?: (pin: MapPin) => void;
  language: string;
}

export const LayerFeedCard = React.memo(function LayerFeedCard({ pin, onRoute, onSave, language }: LayerFeedCardProps) {
  const { colours } = useApp();
  const config = LAYER_CONFIG[pin.category];
  const BadgeIcon = LAYER_ICONS[pin.category];

  const handleShare = () => {
    const msg = `${pin.name} - ${pin.subtitle}${pin.url ? '\n' + pin.url : ''}`;
    Share.share({ message: msg }).catch(() => {});
  };

  return (
    <View style={[styles.card, { backgroundColor: colours.card, borderLeftColor: config.color }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: config.color + '22' }]}>
          <BadgeIcon size={11} color={config.color} />
          <Text style={[styles.badgeText, { color: config.color }]}>
            {language === 'fr' ? config.labelFr : config.label}
          </Text>
        </View>
        {pin.time != null && (
          <View style={[styles.timeBadge, { backgroundColor: colours.muted + '15' }]}>
            <Ionicons name="time-outline" size={10} color={colours.muted} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>{pin.time}</Text>
          </View>
        )}
        {pin.rating != null && (
          <Text style={[styles.rating, { color: colours.muted }]}>{'\u2605'} {pin.rating}</Text>
        )}
      </View>
      <Text style={[styles.title, { color: colours.text }]} numberOfLines={1}>{pin.name}</Text>
      <Text style={[styles.subtitle, { color: colours.muted }]} numberOfLines={1}>{pin.subtitle}</Text>
      <View style={styles.footer}>
        {pin.isOpenNow !== undefined && (
          <Text style={[styles.meta, { color: pin.isOpenNow ? colours.green : colours.muted }]}>
            {pin.isOpenNow ? (language === 'fr' ? 'Ouvert' : 'Open') : (language === 'fr' ? 'Ferm\u00e9' : 'Closed')}
          </Text>
        )}
        <View style={styles.actions}>
          {onSave && (
            <TouchableOpacity onPress={() => onSave(pin)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="bookmark-outline" size={16} color={colours.muted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-outline" size={16} color={colours.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRoute(pin)} style={styles.routeBtn}>
            <Text style={[styles.routeBtnText, { color: colours.accent }]}>
              {language === 'fr' ? 'Itin\u00e9raire \u2192' : 'Route there \u2192'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, gap: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  rating: { fontSize: 11 },
  title: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  subtitle: { fontSize: 12, marginBottom: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 11 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  routeBtn: {},
  routeBtnText: { fontSize: 12, fontWeight: '700' },
});
