import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import SavedPlaceCard from '../SavedPlaceCard';

interface SavedPlace {
  id: string;
  name: string;
  vicinity: string;
  rating?: number;
  photoRef?: string;
  categoryIcon: string;
  categoryColor: string;
  categoryLabel_en: string;
  categoryLabel_fr: string;
  lat?: number;
  lng?: number;
}

interface Props {
  savedPlaces: SavedPlace[];
  colours: any;
  fonts: any;
  language: string;
  t: (en: string, fr: string) => string;
  cardShadow: any;
  onRemove: (id: string) => void;
}

export default function YourSpotsSection({ savedPlaces, colours, fonts, language, t, cardShadow, onRemove }: Props) {
  const router = useRouter();
  const [removeTarget, setRemoveTarget] = useState<SavedPlace | null>(null);

  return (
    <View style={{ paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          {t('Your Spots', 'Vos lieux')}
        </Text>
      </View>
      {savedPlaces.length === 0 ? (
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/map' as any)}
          style={{ marginHorizontal: 20, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colours.border, borderStyle: 'dashed', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ fontSize: 22 }}>📍</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
            {t('No saved spots yet', 'Aucun lieu sauvegardé')}
          </Text>
          <Text style={{ fontSize: 12, color: colours.muted, textAlign: 'center' }}>
            {t('Save places on the Live Map for one-tap routing', 'Sauvegardez des lieux sur la carte pour un itinéraire rapide')}
          </Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          horizontal
          data={savedPlaces}
          keyExtractor={p => p.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 20, paddingRight: 20, gap: 10, paddingBottom: 4 }}
          style={{ marginBottom: 8 }}
          snapToInterval={170}
          decelerationRate="fast"
          renderItem={({ item: place }) => (
            <SavedPlaceCard
              place={place}
              colours={colours}
              fonts={fonts}
              language={language}
              t={t}
              onPress={() => router.push({
                pathname: '/(tabs)/planner',
                params: { toLabel: place.name, toLat: String(place.lat), toLng: String(place.lng) }
              } as any)}
              onLongPress={() => setRemoveTarget(place)}
              cardShadow={cardShadow}
            />
          )}
        />
      )}
      {removeTarget && (
        <Modal visible={!!removeTarget} transparent animationType="fade" onRequestClose={() => setRemoveTarget(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <View style={{ backgroundColor: colours.surface, borderRadius: 20, padding: 24, width: '100%', borderWidth: 1, borderColor: colours.border }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, marginBottom: 6 }}>Remove spot?</Text>
              <Text style={{ fontSize: 14, color: colours.muted, marginBottom: 24 }}>{removeTarget.name}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => setRemoveTarget(null)} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colours.muted }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { onRemove(removeTarget.id); setRemoveTarget(null); }} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#cc3b2a12', borderWidth: 1, borderColor: '#cc3b2a40', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#cc3b2a' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
