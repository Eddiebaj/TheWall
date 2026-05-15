import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { haversineKm } from '../lib/geo';
import { HAPPY_HOUR_VENUES, HappyHourVenue } from '../lib/happyHourData';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

type CategoryFilter = 'all' | 'food' | 'fitness' | 'shopping' | 'services';

interface Props {
  userLat: number;
  userLng: number;
  savedBoardAnchors: { lat: number; lng: number }[];
  onPressVenue: (venue: HappyHourVenue) => void;
  categoryFilter?: CategoryFilter;
}

const TYPE_LABELS: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Food',
  club: 'Club',
  fitness: 'Fitness',
};

const CATEGORY_TYPE_MAP: Record<CategoryFilter, string[]> = {
  all: [],
  food: ['restaurant', 'bar', 'club'],
  fitness: ['fitness'],
  shopping: [],
  services: [],
};

function formatWalkDist(km: number): string {
  const m = Math.round(km * 1000);
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function VenueCard({ venue, walkKm, todayDeal, staticPhotoUrl, onPress, colours, fonts, t }: {
  venue: HappyHourVenue; walkKm: number; todayDeal: any; staticPhotoUrl: string | null;
  onPress: () => void; colours: any; fonts: any; t: any;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(staticPhotoUrl);
  useEffect(() => {
    if (staticPhotoUrl) return;
    fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=nearby&location=${venue.lat},${venue.lng}&radius=100&type=bar|restaurant`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const match = (data?.results || []).find((p: any) =>
          p.name.toLowerCase().includes(venue.name.toLowerCase().split(' ')[0])
        ) || data?.results?.[0];
        const ref = match?.photos?.[0]?.photo_reference;
        if (ref) setPhotoUrl(`https://routeo-backend.vercel.app/api/places?action=photo&photo_reference=${ref}&maxwidth=400`);
      })
      .catch(() => {});
  }, [venue.lat, venue.lng, venue.name, staticPhotoUrl]);

  const hour = new Date().getHours();
  const isOpen = hour >= 11 && hour < 23;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{ borderRadius: 12, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, overflow: 'hidden' }}
    >
      <View style={{ position: 'relative' }}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: '100%', height: 140 }} resizeMode="cover" />
        ) : (
          <View style={{ width: '100%', height: 140, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="storefront-outline" size={28} color={colours.accent} />
          </View>
        )}
        {!isOpen && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#e74c3c', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: 'white' }}>{t('Closed', 'Fermé')}</Text>
          </View>
        )}
        <TouchableOpacity
          style={{ position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}
          onPress={(e) => { e.stopPropagation(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="heart-outline" size={14} color="white" />
        </TouchableOpacity>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text, marginBottom: 2 }} numberOfLines={1}>{venue.name}</Text>
        <Text style={{ fontSize: 10, color: colours.muted, marginBottom: 4 }} numberOfLines={1}>{formatWalkDist(walkKm)} {t('walk', 'marche')}</Text>
        {todayDeal && (
          <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }} numberOfLines={2}>{todayDeal.description}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function NearYouNowSection({
  userLat,
  userLng,
  savedBoardAnchors,
  onPressVenue,
  categoryFilter: externalFilter,
}: Props) {
  const { colours, fonts, t } = useApp();
  const [internalFilter, setInternalFilter] = useState<CategoryFilter>('all');
  const activeFilter = externalFilter ?? internalFilter;

  const todayDow = new Date().getDay();

  const nearbyVenues = useMemo(() => {
    const anchors = [{ lat: userLat, lng: userLng }, ...savedBoardAnchors];
    return HAPPY_HOUR_VENUES
      .filter(v => anchors.some(a => haversineKm(v.lat, v.lng, a.lat, a.lng) <= 2.0))
      .sort((a, b) => {
        const distA = Math.min(...anchors.map(anc => haversineKm(a.lat, a.lng, anc.lat, anc.lng)));
        const distB = Math.min(...anchors.map(anc => haversineKm(b.lat, b.lng, anc.lat, anc.lng)));
        return distA - distB;
      });
  }, [userLat, userLng, savedBoardAnchors]);

  const filteredVenues = useMemo(() => {
    if (activeFilter === 'all') return nearbyVenues;
    const allowed = CATEGORY_TYPE_MAP[activeFilter];
    if (allowed.length === 0) return [];
    return nearbyVenues.filter(v => v.type.some(t => allowed.includes(t)));
  }, [nearbyVenues, activeFilter]);

  const chips: { key: CategoryFilter; label_en: string; label_fr: string }[] = [
    { key: 'all',      label_en: 'All',      label_fr: 'Tout'      },
    { key: 'food',     label_en: 'Bars',     label_fr: 'Bars'      },
    { key: 'fitness',  label_en: 'Fitness',  label_fr: 'Sport'     },
    { key: 'shopping', label_en: 'Shopping', label_fr: 'Courses'   },
    { key: 'services', label_en: 'Services', label_fr: 'Services'  },
  ];

  if (nearbyVenues.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text, letterSpacing: 0.5 }}>
          {t('Near You Now', 'Près de vous maintenant')}
        </Text>
        <TouchableOpacity
          onPress={() => setInternalFilter('all')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colours.accent + '18' }}
        >
          <Ionicons name="locate-outline" size={13} color={colours.accent} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>Nearest</Text>
        </TouchableOpacity>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
      >
        {chips.map(chip => {
          const active = activeFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              activeOpacity={0.7}
              onPress={() => {
                if (!externalFilter) setInternalFilter(chip.key);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: active ? colours.accent : colours.border,
                backgroundColor: active ? colours.accent + '15' : colours.surface,
              }}
            >
              <Text style={{
                fontSize: fonts.sm,
                fontWeight: active ? '700' : '500',
                color: active ? colours.accent : colours.muted,
              }}>
                {t(chip.label_en, chip.label_fr)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Venue cards */}
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {filteredVenues.length === 0 ? (
          <Text style={{ fontSize: fonts.sm, color: colours.muted, paddingVertical: 8 }}>
            {t('No venues nearby in this category', 'Aucun établissement dans cette catégorie')}
          </Text>
        ) : (
          filteredVenues.map(venue => {
            const walkKm = haversineKm(userLat, userLng, venue.lat, venue.lng);
            const todayDeal = venue.deals.find(d => d.days.includes(todayDow)) ?? null;
            const photoUrl = venue.photoUrl || null;
            return (
              <View key={`${venue.lat},${venue.lng}`} style={{ width: '47%' }}>
            <VenueCard
              key={`inner_${venue.lat},${venue.lng}`}
                venue={venue}
                walkKm={walkKm}
                todayDeal={todayDeal}
                staticPhotoUrl={photoUrl}
                onPress={() => onPressVenue(venue)}
                colours={colours}
                fonts={fonts}
                t={t}
              />
            </View>
            );
          })
        )}
      </View>
    </View>
  );
}
