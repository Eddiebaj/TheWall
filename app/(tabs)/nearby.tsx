import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, ImageBackground, Linking,
  ScrollView, StatusBar, Text, TouchableOpacity, View
} from 'react-native';
import { useApp } from '../../context/AppContext';

const PLACES_KEY = 'AIzaSyCKwAVVCbxHKsKViJ4Dq0ZQ5r6k-arue3E';

const CATEGORIES = [
  { id: 'restaurant', label_en: 'Eats', label_fr: 'Restos', icon: '🍽️', color: '#cc3b2a' },
  { id: 'cafe', label_en: 'Coffee', label_fr: 'Café', icon: '☕', color: '#c0852a' },
  { id: 'shopping_mall', label_en: 'Shopping', label_fr: 'Magasins', icon: '🛍️', color: '#004890' },
  { id: 'gym', label_en: 'Gyms', label_fr: 'Gyms', icon: '💪', color: '#00A78D' },
  { id: 'supermarket', label_en: 'Grocery', label_fr: 'Épicerie', icon: '🛒', color: '#004890' },
  { id: 'pharmacy', label_en: 'Pharmacy', label_fr: 'Pharmacie', icon: '💊', color: '#7b5ea7' },
  { id: 'hardware_store', label_en: 'Hardware', label_fr: 'Quincaillerie', icon: '🔧', color: '#e8a020' },
  { id: 'bank', label_en: 'Services', label_fr: 'Services', icon: '🏢', color: '#6b7f99' },
];

type Category = typeof CATEGORIES[0];
type Place = {
  id: string;
  name: string;
  vicinity: string;
  distance: number;
  rating?: number;
  open?: boolean;
  photoRef?: string;
};

export default function ExploreScreen() {
  const { colours, theme, language, t, fonts } = useApp();
  const isLight = theme === 'light';

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getLocation(); }, []);
  useEffect(() => { if (location) fetchPlaces(); }, [location, selectedCategory]);

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError(t(
        'Location permission denied — enable it in Settings to use Explore.',
        'Permission de localisation refusée — activez-la dans les paramètres.'
      ));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
  };

  const fetchPlaces = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=1000&type=${selectedCategory.id}&key=${PLACES_KEY}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const results: Place[] = (data.results || []).slice(0, 12).map((p: any) => ({
        id: p.place_id,
        name: p.name,
        vicinity: p.vicinity,
        distance: getDistance(location.lat, location.lng, p.geometry.location.lat, p.geometry.location.lng),
        rating: p.rating,
        open: p.opening_hours?.open_now,
        photoRef: p.photos?.[0]?.photo_reference ?? null,
      }));
      results.sort((a, b) => a.distance - b.distance);
      setPlaces(results);
    } catch { setPlaces([]); }
    finally { setLoading(false); }
  };

  const getPhotoUrl = (ref: string) =>
    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${ref}&key=${PLACES_KEY}`;

  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const openInMaps = (name: string, vicinity: string) =>
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(`${name} ${vicinity}`)}`);

  const formatDistance = (m: number) => m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
  const catLabel = (cat: Category) => language === 'fr' ? cat.label_fr : cat.label_en;

  const renderPlaceCard = (place: Place, index: number) => {
    const hasPhoto = !!place.photoRef;
    return (
      <TouchableOpacity
        key={place.id}
        style={{
          borderRadius: 16,
          marginBottom: 14,
          overflow: 'hidden',
          backgroundColor: colours.surface,
          shadowColor: '#004890',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isLight ? 0.1 : 0.0,
          shadowRadius: 10,
          elevation: 3,
        }}
        onPress={() => openInMaps(place.name, place.vicinity)}
        activeOpacity={0.92}
      >
        {/* Photo or fallback */}
        <ImageBackground
          source={hasPhoto ? { uri: getPhotoUrl(place.photoRef!) } : undefined}
          style={{
            width: '100%',
            height: 160,
            backgroundColor: hasPhoto ? '#1a1a2a' : selectedCategory.color + '18',
            alignItems: hasPhoto ? undefined : 'center',
            justifyContent: hasPhoto ? undefined : 'center',
          }}
          resizeMode="cover"
        >
          {/* Fallback icon */}
          {!hasPhoto && (
            <Text style={{ fontSize: 40 }}>{selectedCategory.icon}</Text>
          )}

          {/* Distance badge — top right */}
          <View style={{
            position: 'absolute', top: 10, right: 10,
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ color: 'white', fontSize: fonts.sm, fontWeight: '700' }}>
              {formatDistance(place.distance)}
            </Text>
          </View>

          {/* Open/Closed badge — top left */}
          {place.open !== undefined && (
            <View style={{
              position: 'absolute', top: 10, left: 10,
              backgroundColor: place.open ? 'rgba(0,167,141,0.85)' : 'rgba(180,50,40,0.85)',
              borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: 'white', fontSize: fonts.sm, fontWeight: '700' }}>
                {place.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
              </Text>
            </View>
          )}

          {/* Simulated gradient + name overlay */}
          {hasPhoto && (
            <View style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 90,
              justifyContent: 'flex-end',
              paddingHorizontal: 12,
              paddingBottom: 10,
            }}>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90, backgroundColor: 'rgba(0,0,0,0.15)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: 'rgba(0,0,0,0.20)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 50, backgroundColor: 'rgba(0,0,0,0.20)' }} />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, backgroundColor: 'rgba(0,0,0,0.15)' }} />
              <Text
                numberOfLines={1}
                style={{ color: 'white', fontSize: fonts.lg, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 }}
              >
                {place.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: fonts.sm, marginTop: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 }}
              >
                {place.vicinity}
              </Text>
            </View>
          )}
        </ImageBackground>

        {/* Bottom info row */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: colours.surface,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 24, height: 24, borderRadius: 7,
              backgroundColor: selectedCategory.color + '18',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: selectedCategory.color }}>{index + 1}</Text>
            </View>
            {place.rating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: fonts.sm, color: colours.orange }}>★</Text>
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text }}>{place.rating}</Text>
              </View>
            )}
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>·</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
              {Math.ceil(place.distance / 80)} {t('min walk', 'min à pied')}
            </Text>
          </View>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>
            {t('Maps →', 'Cartes →')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (locationError) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📍</Text>
        <Text style={{ color: colours.red, fontSize: fonts.md, textAlign: 'center', lineHeight: 22 }}>{locationError}</Text>
        <TouchableOpacity
          style={{ marginTop: 16, backgroundColor: colours.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 }}
          onPress={() => Linking.openSettings()}>
          <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Open Settings', 'Ouvrir les paramètres')}</Text>
        </TouchableOpacity>
      </View>
    );
    if (!location) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <ActivityIndicator color={colours.accent} size="large" />
        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 12 }}>
          {t('Getting your location...', 'Obtention de votre position...')}
        </Text>
      </View>
    );
    if (loading) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <ActivityIndicator color={colours.accent} size="large" />
        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center', marginTop: 12 }}>
          {t(`Scanning nearby ${catLabel(selectedCategory).toLowerCase()}...`, `Recherche de ${catLabel(selectedCategory).toLowerCase()} à proximité...`)}
        </Text>
      </View>
    );
    if (places.length === 0) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>{selectedCategory.icon}</Text>
        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center' }}>
          {t(`No ${catLabel(selectedCategory).toLowerCase()} found nearby`, `Aucun(e) ${catLabel(selectedCategory).toLowerCase()} trouvé(e) à proximité`)}
        </Text>
      </View>
    );
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 12 }}
      >
        <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {places.length} {catLabel(selectedCategory).toLowerCase()} {t('within 1km · sorted by distance', 'dans 1km · trié par distance')}
        </Text>
        {places.map((place, index) => renderPlaceCard(place, index))}
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <View>
          <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -1 }}>
            Route<Text style={{ color: colours.accent }}>O</Text>
          </Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, letterSpacing: 2, marginTop: -2 }}>
            {t('EXPLORE NEARBY', 'EXPLORER À PROXIMITÉ')}
          </Text>
        </View>
        {location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.accent + '18', borderWidth: 1, borderColor: colours.accent + '40', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
            <Text style={{ fontSize: fonts.sm }}>📍</Text>
            <Text style={{ color: colours.accent, fontSize: fonts.sm, fontWeight: '700' }}>{t('Located', 'Localisé')}</Text>
          </View>
        )}
      </View>

      {/* Category chips */}
      <View style={{ height: 44, justifyContent: 'center', marginBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, alignItems: 'center' }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, height: 32,
                backgroundColor: selectedCategory.id === cat.id ? cat.color + '18' : colours.surface,
                borderColor: selectedCategory.id === cat.id ? cat.color : colours.border,
              }}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={{ fontSize: fonts.sm }}>{cat.icon}</Text>
              <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: selectedCategory.id === cat.id ? cat.color : colours.muted }}>
                {catLabel(cat)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {renderContent()}
      </View>
    </View>
  );
}