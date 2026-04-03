import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapPin, LAYER_CONFIG } from '../lib/mapLayers';
import { useApp } from '../context/AppContext';

interface LayerFeedCardProps {
  pin: MapPin;
  onRoute: (pin: MapPin) => void;
  language: string;
}

export const LayerFeedCard = React.memo(function LayerFeedCard({ pin, onRoute, language }: LayerFeedCardProps) {
  const { colours } = useApp();
  const config = LAYER_CONFIG[pin.category];

  return (
    <View style={[styles.card, { backgroundColor: colours.card, borderLeftColor: config.color }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: config.color + '22' }]}>
          <Ionicons name={config.icon as any} size={11} color={config.color} />
          <Text style={[styles.badgeText, { color: config.color }]}>
            {language === 'fr' ? config.labelFr : config.label}
          </Text>
        </View>
        {pin.rating != null && (
          <Text style={[styles.rating, { color: colours.muted }]}>{'\u2605'} {pin.rating}</Text>
        )}
      </View>
      <Text style={[styles.title, { color: colours.text }]} numberOfLines={1}>{pin.name}</Text>
      <Text style={[styles.subtitle, { color: colours.muted }]} numberOfLines={1}>{pin.subtitle}</Text>
      <View style={styles.footer}>
        {pin.time != null && (
          <Text style={[styles.meta, { color: colours.muted }]}>{pin.time}</Text>
        )}
        {pin.isOpenNow !== undefined && (
          <Text style={[styles.meta, { color: pin.isOpenNow ? colours.green : colours.muted }]}>
            {pin.isOpenNow ? (language === 'fr' ? 'Ouvert' : 'Open') : (language === 'fr' ? 'Ferm\u00e9' : 'Closed')}
          </Text>
        )}
        <TouchableOpacity onPress={() => onRoute(pin)} style={styles.routeBtn}>
          <Text style={[styles.routeBtnText, { color: colours.accent }]}>
            {language === 'fr' ? 'Itin\u00e9raire \u2192' : 'Route there \u2192'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, gap: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  rating: { fontSize: 11 },
  title: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  subtitle: { fontSize: 12, marginBottom: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { fontSize: 11 },
  routeBtn: { marginLeft: 'auto' },
  routeBtnText: { fontSize: 12, fontWeight: '700' },
});
