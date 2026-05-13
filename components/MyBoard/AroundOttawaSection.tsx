import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

interface Props {
  colours: any;
  t: (en: string, fr: string) => string;
  cardShadow: any;
  language: string;
}

export default function AroundOttawaSection({ colours, t, cardShadow, language }: Props) {
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
            <TouchableOpacity
              key={i}
              onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(place.name + ' Ottawa')}`)}
              style={{ width: '46%', borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}
            >
              {/* Square photo */}
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
              </View>
              {/* Info */}
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
          ))}
        </View>
      )}
    </View>
  );
}
