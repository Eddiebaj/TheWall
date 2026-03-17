import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ImageBackground, Linking, Platform,
  ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../context/AppContext';
import { PlaceCardSkeleton } from '../../components/Shimmer';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { SK_SAVED_PLACES } from '../../lib/storageKeys';
import { supabase } from '../../lib/supabase';
const ARRIVALS_URL = 'https://routeo-backend.vercel.app/api/arrivals';

const CATEGORIES = [
  { id: 'restaurant', label_en: 'Eats', label_fr: 'Restos', icon: 'restaurant', color: '#cc3b2a' },
  { id: 'cafe', label_en: 'Coffee', label_fr: 'Café', icon: 'cafe', color: '#c0852a' },
  { id: 'shopping', label_en: 'Shopping', label_fr: 'Magasins', icon: 'bag-handle', color: '#004890' },
  { id: 'gym', label_en: 'Gyms', label_fr: 'Gyms', icon: 'barbell', color: '#00A78D' },
  { id: 'supermarket', label_en: 'Grocery', label_fr: 'Épicerie', icon: 'cart', color: '#004890' },
  { id: 'pharmacy', label_en: 'Pharmacy', label_fr: 'Pharmacie', icon: 'medical', color: '#7b5ea7' },
  { id: 'hardware_store', label_en: 'Hardware', label_fr: 'Quincaillerie', icon: 'construct', color: '#e8a020' },
  { id: 'bank', label_en: 'Services', label_fr: 'Services', icon: 'business', color: '#6b7f99' },
];

const SORT_OPTIONS = [
  { id: 'distance', label_en: 'Nearest', label_fr: 'Plus proche', icon: 'walk' },
  { id: 'rating', label_en: 'Top Rated', label_fr: 'Mieux noté', icon: 'star' },
  { id: 'open', label_en: 'Open Now', label_fr: 'Ouvert', icon: 'time' },
] as const;

// Distance filter options in metres — 0 means "show all"
const DISTANCE_OPTIONS = [
  { label: 'All', label_fr: 'Tout', value: 0 },
  { label: '1 km', label_fr: '1 km', value: 1000 },
  { label: '2 km', label_fr: '2 km', value: 2000 },
  { label: '3 km', label_fr: '3 km', value: 3000 },
  { label: '5 km', label_fr: '5 km', value: 5000 },
];

// Fetch radius — large enough to capture the whole downtown core
const FETCH_RADIUS = 5000;

type SortId = typeof SORT_OPTIONS[number]['id'];
type Category = typeof CATEGORIES[0];
type Place = {
  id: string;
  name: string;
  vicinity: string;
  distance: number;
  lat: number;
  lng: number;
  rating?: number;
  reviewCount?: number;
  open?: boolean;
  photoRef?: string;
};

type StopCoord = { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number };
type NearbyTransit = { stopName: string; stopId: string; walkMin: number; routeId: string; minsAway: number };

export default function ExploreScreen() {
  const { colours, theme, language, t, fonts } = useApp();
  const router = useRouter();
  const isLight = theme === 'light';

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState('');
  const { category } = useLocalSearchParams<{ category?: string }>();
  const [selectedCategory, setSelectedCategory] = useState(
    CATEGORIES.find(c => c.id === category) || CATEGORIES[0]
  );
  const [sortBy, setSortBy] = useState<SortId>('distance');
  const [maxDistance, setMaxDistance] = useState(0); // 0 = show all
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [filteredPlaces, setFilteredPlaces] = useState<Place[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const [nearbyStops, setNearbyStops] = useState<StopCoord[]>([]);
  const [transitMap, setTransitMap] = useState<{ [placeId: string]: NearbyTransit }>({});
  const transitFetchedRef = useRef<Set<string>>(new Set());
  const [savedPlaceIds, setSavedPlaceIds] = useState<Set<string>>(new Set());

  // Load saved place IDs on mount
  useEffect(() => {
    AsyncStorage.getItem(SK_SAVED_PLACES).then(val => {
      try {
        if (val) {
          const places: any[] = JSON.parse(val);
          setSavedPlaceIds(new Set(places.map(p => p.id)));
        }
      } catch { /* ignore */ }
    });
  }, []);

  const toggleSavePlace = async (place: Place) => {
    try {
      const raw = await AsyncStorage.getItem(SK_SAVED_PLACES);
      let places: any[] = raw ? JSON.parse(raw) : [];
      const exists = places.some(p => p.id === place.id);
      if (exists) {
        places = places.filter(p => p.id !== place.id);
        setSavedPlaceIds(prev => { const next = new Set(prev); next.delete(place.id); return next; });
      } else {
        places.push({
          id: place.id, name: place.name, vicinity: place.vicinity,
          rating: place.rating, photoRef: place.photoRef,
          categoryIcon: selectedCategory.icon, categoryColor: selectedCategory.color,
          categoryLabel_en: selectedCategory.label_en, categoryLabel_fr: selectedCategory.label_fr,
          lat: place.lat, lng: place.lng,
        });
        setSavedPlaceIds(prev => new Set(prev).add(place.id));
      }
      await AsyncStorage.setItem(SK_SAVED_PLACES, JSON.stringify(places));
    } catch (e) { if (__DEV__) console.warn('toggleSavePlace failed:', e); }
  };

  useEffect(() => { getLocation(); }, []);
  useEffect(() => { if (location) fetchPlaces(); }, [location, selectedCategory, sortBy]);

  // Load stops from Supabase when location is available
  useEffect(() => {
    if (!location || nearbyStops.length > 0) return;
    const delta = 0.04; // ~4km bounding box
    supabase.from('stops')
      .select('stop_id,stop_name,stop_lat,stop_lon')
      .gte('stop_lat', location.lat - delta)
      .lte('stop_lat', location.lat + delta)
      .gte('stop_lon', location.lng - delta)
      .lte('stop_lon', location.lng + delta)
      .limit(500)
      .then(({ data }) => {
        if (data && data.length > 0) setNearbyStops(data);
      })
      .catch(e => { if (__DEV__) console.warn('Supabase stops query failed:', e); });
  }, [location]);

  // Find nearest stop + next arrival for each place
  useEffect(() => {
    if (nearbyStops.length === 0 || filteredPlaces.length === 0) return;
    const placesToFetch = filteredPlaces.filter(p => !transitFetchedRef.current.has(p.id));
    if (placesToFetch.length === 0) return;

    const fetchTransit = async () => {
      const updates: { [placeId: string]: NearbyTransit } = {};
      // Process up to 8 places at a time to avoid hammering the API
      const batch = placesToFetch.slice(0, 8);
      await Promise.all(batch.map(async (place) => {
        transitFetchedRef.current.add(place.id);
        // Find nearest stop
        let nearest: StopCoord | null = null;
        let nearestDist = Infinity;
        for (const stop of nearbyStops) {
          const d = getDistance(place.lat, place.lng, stop.stop_lat, stop.stop_lon);
          if (d < nearestDist) { nearestDist = d; nearest = stop; }
        }
        if (!nearest || nearestDist > 2000) return; // skip if > 2km
        try {
          const resp = await fetchWithTimeout(`${ARRIVALS_URL}?stop=${nearest.stop_id}`);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const first = (data.arrivals || [])[0];
          if (first) {
            updates[place.id] = {
              stopName: nearest.stop_name,
              stopId: nearest.stop_id,
              walkMin: Math.max(1, Math.ceil(nearestDist / 80)),
              routeId: String(first.routeId).split('-')[0],
              minsAway: first.minsAway,
            };
          }
        } catch (e) { if (__DEV__) console.warn('fetch nearby arrivals failed:', e); }
      }));
      if (Object.keys(updates).length > 0) {
        setTransitMap(prev => ({ ...prev, ...updates }));
      }
    };
    fetchTransit();
  }, [nearbyStops, filteredPlaces]);

  // Re-filter client-side when distance cap or search query changes — no extra API call needed
  useEffect(() => {
    applyFilters(allPlaces, searchQuery, maxDistance);
  }, [searchQuery, maxDistance, allPlaces]);

  const applyFilters = (places: Place[], query: string, distCap: number) => {
    let result = places;
    if (distCap > 0) result = result.filter(p => p.distance <= distCap);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) || p.vicinity.toLowerCase().includes(q)
      );
    }
    setFilteredPlaces(result);
  };

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

  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const fetchPlaces = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const types = selectedCategory.id === 'shopping'
        ? ['shopping_mall', 'clothing_store', 'shoe_store', 'jewelry_store', 'department_store']
        : [selectedCategory.id];

      const results: Place[] = [];
      for (const type of types) {
        // Use radius instead of rankby=distance so we capture everything within the area
        const url = `https://routeo-backend.vercel.app/api/places?action=nearby&location=${location.lat},${location.lng}&radius=${FETCH_RADIUS}&type=${type}`;
        const resp = await fetchWithTimeout(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        (data.results || []).forEach((p: any) => {
          if (results.find(r => r.id === p.place_id)) return;
          const loc = p.geometry?.location;
          if (!loc?.lat || !loc?.lng) return;
          results.push({
            id: p.place_id,
            name: p.name,
            vicinity: p.vicinity,
            lat: loc.lat,
            lng: loc.lng,
            distance: getDistance(location.lat, location.lng, loc.lat, loc.lng),
            rating: p.rating,
            reviewCount: p.user_ratings_total,
            open: p.opening_hours?.open_now,
            photoRef: p.photos?.[0]?.photo_reference ?? null,
          });
        });
      }

      // Sort the full unfiltered set
      if (sortBy === 'rating') {
        // Bayesian popularity score — blends stars with review volume so a 4.8★ with
        // 3 reviews does not beat a 4.5★ with 2,000. C = damping constant (reviews needed
        // before rating is trusted at face value). globalMean = prior for unknown places.
        const C = 200;
        const GLOBAL_MEAN = 4.0;
        const score = (p: Place) => {
          const n = p.reviewCount ?? 0;
          const s = p.rating ?? GLOBAL_MEAN;
          return (n / (n + C)) * s + (C / (n + C)) * GLOBAL_MEAN;
        };
        results.sort((a, b) => score(b) - score(a));
      } else if (sortBy === 'open') {
        results.sort((a, b) => {
          if (a.open === b.open) return a.distance - b.distance;
          return a.open ? -1 : 1;
        });
      } else {
        results.sort((a, b) => a.distance - b.distance);
      }

      setAllPlaces(results);
      applyFilters(results, searchQuery, maxDistance);
      setSearchQuery('');
      // Reset transit cache for new category
      transitFetchedRef.current.clear();
      setTransitMap({});
    } catch {
      setAllPlaces([]);
      setFilteredPlaces([]);
    } finally {
      setLoading(false);
    }
  };

  const getPhotoUrl = (ref: string) =>
    `https://routeo-backend.vercel.app/api/places?action=photo&photo_reference=${ref}&maxwidth=600`;

  const navigateToPlanner = (place: Place) =>
    router.push({ pathname: '/(tabs)/planner', params: { toLabel: place.name, toLat: String(place.lat), toLng: String(place.lng) } } as any);

  const formatDistance = (m: number) => m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
  const catLabel = (cat: Category) => language === 'fr' ? cat.label_fr : cat.label_en;

  const sortLabel = () => {
    const opt = SORT_OPTIONS.find(o => o.id === sortBy);
    if (!opt) return '';
    return language === 'fr' ? opt.label_fr : opt.label_en;
  };

  const renderPlaceCard = (place: Place, index: number) => {
    const hasPhoto = !!place.photoRef;
    const transit = transitMap[place.id];
    return (
      <TouchableOpacity
        key={place.id}
        style={{
          borderRadius: 12,
          marginBottom: 10,
          overflow: 'hidden',
          backgroundColor: colours.surface,
          shadowColor: '#004890',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isLight ? 0.08 : 0.0,
          shadowRadius: 8,
          elevation: 2,
        }}
        onPress={() => navigateToPlanner(place)}
        activeOpacity={0.92}
      >
        <ImageBackground
          source={hasPhoto ? { uri: getPhotoUrl(place.photoRef!) } : undefined}
          style={{
            width: '100%',
            height: 120,
            backgroundColor: hasPhoto ? '#1a1a2a' : selectedCategory.color + '18',
            alignItems: hasPhoto ? undefined : 'center',
            justifyContent: hasPhoto ? undefined : 'center',
          }}
          resizeMode="cover"
        >
          {!hasPhoto && (
            <Ionicons name={selectedCategory.icon as any} size={32} color={selectedCategory.color} />
          )}

          <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => toggleSavePlace(place)}
              style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 17, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={savedPlaceIds.has(place.id) ? t('Unsave place', 'Retirer le lieu') : t('Save place', 'Sauvegarder le lieu')}
            >
              <Ionicons name={savedPlaceIds.has(place.id) ? 'bookmark' : 'bookmark-outline'} size={15} color={savedPlaceIds.has(place.id) ? '#e8a020' : 'white'} />
            </TouchableOpacity>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontSize: fonts.sm, fontWeight: '700' }}>
                {formatDistance(place.distance)}
              </Text>
            </View>
          </View>

          {place.open !== undefined && (
            <View style={{
              position: 'absolute', top: 8, left: 8,
              backgroundColor: place.open ? 'rgba(0,167,141,0.85)' : 'rgba(180,50,40,0.85)',
              borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ color: 'white', fontSize: fonts.sm, fontWeight: '700' }}>
                {place.open ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
              </Text>
            </View>
          )}

          {hasPhoto && (
            <View style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 70,
              justifyContent: 'flex-end',
              paddingHorizontal: 10,
              paddingBottom: 8,
            }}>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: 'rgba(0,0,0,0.30)' }} />
              <Text numberOfLines={1} style={{ color: 'white', fontSize: fonts.md, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 }}>
                {place.name}
              </Text>
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 }}>
                {place.vicinity}
              </Text>
            </View>
          )}
        </ImageBackground>

        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingVertical: 9,
          backgroundColor: colours.surface,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{
              width: 20, height: 20, borderRadius: 4,
              backgroundColor: selectedCategory.color + '18',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: selectedCategory.color }}>{index + 1}</Text>
            </View>
            {place.rating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="star" size={11} color={colours.orange} />
                <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.text }}>{place.rating}</Text>
                {place.reviewCount && (
                  <Text style={{ fontSize: fonts.sm, color: colours.muted }}>({place.reviewCount.toLocaleString()})</Text>
                )}
              </View>
            )}
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>·</Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>
              {Math.ceil(place.distance / 80)} {t('min walk', 'min à pied')}
            </Text>
          </View>
          <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>
            {t('Plan trip →', 'Planifier →')}
          </Text>
        </View>

        {/* Nearest bus stop + next arrival */}
        {transit && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 12, paddingVertical: 7,
            borderTopWidth: 1, borderTopColor: colours.border,
            backgroundColor: colours.surface,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={{
                width: 20, height: 20, borderRadius: 4,
                backgroundColor: colours.accent + '18',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="bus" size={10} color={colours.accent} />
              </View>
              <Text style={{ fontSize: 11, color: colours.muted, flex: 1 }} numberOfLines={1}>
                {transit.stopName}
              </Text>
              <Text style={{ fontSize: 10, color: colours.muted }}>
                {transit.walkMin} {t('min walk', 'min à pied')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
              <View style={{ backgroundColor: colours.accent + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, minWidth: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colours.accent }}>{transit.routeId}</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: transit.minsAway <= 2 ? '#cc3b2a' : colours.accent }}>
                {transit.minsAway === 0 ? t('Now', 'Maint.') : `${transit.minsAway}m`}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (locationError) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Ionicons name="location-outline" size={40} color={colours.red} style={{ marginBottom: 12 }} />
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
      <View style={{ flex: 1, padding: 20 }}>
        {[0,1,2,3].map(i => <PlaceCardSkeleton key={i} colours={colours} />)}
      </View>
    );
    if (filteredPlaces.length === 0) return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Ionicons name={selectedCategory.icon as any} size={40} color={colours.muted} style={{ marginBottom: 12 }} />
        <Text style={{ color: colours.muted, fontSize: fonts.md, textAlign: 'center' }}>
          {searchQuery
            ? t(`No results for "${searchQuery}"`, `Aucun résultat pour "${searchQuery}"`)
            : t(`No ${catLabel(selectedCategory).toLowerCase()} found nearby`, `Aucun(e) ${catLabel(selectedCategory).toLowerCase()} trouvé(e) à proximité`)
          }
        </Text>
        {maxDistance > 0 && (
          <TouchableOpacity
            style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15' }}
            onPress={() => setMaxDistance(0)}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Show all distances', 'Afficher toutes les distances')}</Text>
          </TouchableOpacity>
        )}
        {!searchQuery && maxDistance === 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('Retry search', 'Réessayer la recherche')}
            style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15' }}
            onPress={fetchPlaces}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Retry', 'Réessayer')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}
      >
        <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {filteredPlaces.length} {catLabel(selectedCategory).toLowerCase()} · {sortLabel()}
          {maxDistance > 0 ? ` · within ${formatDistance(maxDistance)}` : ''}
        </Text>
        {filteredPlaces.map((place, index) => renderPlaceCard(place, index))}
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      {/* Search bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 10, height: 38 }}>
          <Ionicons name="search" size={15} color={colours.muted} style={{ marginRight: 7 }} />
          <TextInput
            placeholder={language === 'fr' ? 'Rechercher...' : `Search ${catLabel(selectedCategory).toLowerCase()}...`}
            placeholderTextColor={colours.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{ flex: 1, fontSize: fonts.sm, color: colours.text }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={15} color={colours.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category chips */}
      <View style={{ height: 38, justifyContent: 'center', marginBottom: 3 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 5, alignItems: 'center' }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, height: 28,
                backgroundColor: selectedCategory.id === cat.id ? cat.color + '18' : colours.surface,
                borderColor: selectedCategory.id === cat.id ? cat.color : colours.border,
              }}
              onPress={() => { setSelectedCategory(cat); setSearchQuery(''); }}
            >
              <Ionicons name={cat.icon as any} size={12} color={selectedCategory.id === cat.id ? cat.color : colours.muted} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: selectedCategory.id === cat.id ? cat.color : colours.muted }}>
                {catLabel(cat)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sort chips */}
      <View style={{ height: 32, justifyContent: 'center', marginBottom: 3 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 5, alignItems: 'center' }}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, height: 28,
                backgroundColor: sortBy === opt.id ? colours.accent + '18' : colours.surface,
                borderColor: sortBy === opt.id ? colours.accent : colours.border,
              }}
              onPress={() => setSortBy(opt.id)}
            >
              <Ionicons name={opt.icon as any} size={11} color={sortBy === opt.id ? colours.accent : colours.muted} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: sortBy === opt.id ? colours.accent : colours.muted }}>
                {language === 'fr' ? opt.label_fr : opt.label_en}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Distance filter chips */}
      <View style={{ height: 32, justifyContent: 'center', marginBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 5, alignItems: 'center' }}>
          {DISTANCE_OPTIONS.map(opt => {
            const isActive = maxDistance === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, height: 28,
                  backgroundColor: isActive ? colours.accentAlt + '18' : colours.surface,
                  borderColor: isActive ? colours.accentAlt : colours.border,
                }}
                onPress={() => setMaxDistance(opt.value)}
              >
                {opt.value === 0 && <Ionicons name="globe-outline" size={11} color={isActive ? colours.accentAlt : colours.muted} />}
                <Text style={{ fontSize: 11, fontWeight: '600', color: isActive ? colours.accentAlt : colours.muted }}>
                  {language === 'fr' ? opt.label_fr : opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {renderContent()}
      </View>
    </View>
  );
}
