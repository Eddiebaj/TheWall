import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

function PlaceCard({ place, colours, t, onSaveToggle }: { place: any; colours: any; t: (en: string, fr: string) => string; onSaveToggle?: () => void }) {
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem('routeo_saved_places').then(val => {
      const places = JSON.parse(val || '[]');
      setSaved(places.some((p: any) => p.id === (place.place_id || place.name)));
    });
  }, []);

  const toggleSave = async () => {
    const key = 'routeo_saved_places';
    const existing = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    if (saved) {
      const updated = existing.filter((p: any) => p.id !== (place.place_id || place.name));
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } else {
      existing.push({
        id: place.place_id || place.name,
        name: place.name,
        vicinity: place.vicinity || '',
        rating: place.rating,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
        photoRef: place.photos?.[0]?.photo_reference || null,
        categoryIcon: 'location',
        categoryColor: '#00A78D',
        categoryLabel_en: place.types?.[0] || 'Place',
        categoryLabel_fr: place.types?.[0] || 'Lieu',
      });
      await AsyncStorage.setItem(key, JSON.stringify(existing));
    }
    setSaved(!saved);
    onSaveToggle?.();
  };

  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(place.name + ' Ottawa')}`)}
      style={{ width: '46%', borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}
    >
      <View style={{ width: '100%', aspectRatio: 1.1 }}>
        {place.photos?.[0]?.photo_reference ? (
          <Image
            source={{ uri: `https://routeo-backend.vercel.app/api/places?action=photo&photo_reference=${place.photos[0].photo_reference}&maxwidth=300` }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colours.accent + '12' }}>
            <Ionicons name="location" size={24} color={colours.accent} />
          </View>
        )}
        {place.opening_hours?.open_now !== undefined && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: place.opening_hours.open_now ? '#00A78D' : '#cc3b2a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: 'white' }}>
              {place.opening_hours.open_now ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
            </Text>
          </View>
        )}
        <TouchableOpacity
          onPress={e => { e.stopPropagation(); toggleSave(); }}
          style={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={14} color={saved ? '#cc3b2a' : 'white'} />
        </TouchableOpacity>
      </View>
      <View style={{ padding: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colours.text }} numberOfLines={1}>{place.name}</Text>
        {place.rating && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="star" size={10} color="#e8a020" />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colours.muted }}>{place.rating}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  colours: any;
  t: (en: string, fr: string) => string;
  cardShadow: any;
  language: string;
  onSaveToggle?: () => void;
}

export default function AroundOttawaSection({ colours, t, cardShadow, language, onSaveToggle }: Props) {
  const [aoCategory, setAoCategory] = React.useState<string>('all');
  const [aoPlaces, setAoPlaces] = React.useState<any[]>([]);
  const [aoLoading, setAoLoading] = React.useState(false);

  React.useEffect(() => {
    setAoLoading(true);
    const type = aoCategory === 'all' ? 'restaurant' : aoCategory;
    fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=nearby&location=45.4215,-75.6972&radius=1500&type=${type}`)
      .then(r => r.json())
      .then(d => setAoPlaces((d.results || []).slice(0, 10)))
      .catch(() => setAoPlaces([]))
      .finally(() => setAoLoading(false));
  }, [aoCategory]);

  const categories = [
    { id: 'all', label: t('All', 'Tout'), icon: 'grid-outline' },
    { id: 'restaurant', label: t('Eats', 'Restos'), icon: 'restaurant-outline' },
    { id: 'cafe', label: t('Coffee', 'Café'), icon: 'cafe-outline' },
    { id: 'bar', label: t('Bars', 'Bars'), icon: 'beer-outline' },
    { id: 'gym', label: t('Fitness', 'Sport'), icon: 'barbell-outline' },
  ];

  return (
    <View style={{ paddingTop: 20, paddingBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 }}>
        {t('Around Ottawa', 'Autour d\'Ottawa')}
      </Text>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setAoCategory(cat.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, backgroundColor: aoCategory === cat.id ? colours.accent : colours.surface, borderColor: aoCategory === cat.id ? colours.accent : colours.border }}
          >
            <Ionicons name={cat.icon as any} size={13} color={aoCategory === cat.id ? 'white' : colours.muted} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: aoCategory === cat.id ? 'white' : colours.text }}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Places */}
      {aoLoading ? (
        <ActivityIndicator color={colours.accent} style={{ marginTop: 20 }} />
      ) : (
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {aoPlaces.map((place, i) => (
            <PlaceCard key={place.place_id || i} place={place} colours={colours} t={t} onSaveToggle={onSaveToggle} />
          ))}
        </View>
      )}
    </View>
  );
}
