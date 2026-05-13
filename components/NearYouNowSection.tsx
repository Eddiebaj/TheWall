import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { haversineKm } from '../lib/geo';
import { HAPPY_HOUR_VENUES, HappyHourVenue } from '../lib/happyHourData';

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
  food: ['restaurant', 'bar'],
  fitness: ['fitness'],
  shopping: [],
  services: [],
};

function formatWalkDist(km: number): string {
  const m = Math.round(km * 1000);
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
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
    return HAPPY_HOUR_VENUES.filter(v =>
      anchors.some(a => haversineKm(v.lat, v.lng, a.lat, a.lng) <= 0.5)
    );
  }, [userLat, userLng, savedBoardAnchors]);

  const filteredVenues = useMemo(() => {
    if (activeFilter === 'all') return nearbyVenues;
    const allowed = CATEGORY_TYPE_MAP[activeFilter];
    if (allowed.length === 0) return [];
    return nearbyVenues.filter(v => v.type.some(t => allowed.includes(t)));
  }, [nearbyVenues, activeFilter]);

  const chips: { key: CategoryFilter; label_en: string; label_fr: string }[] = [
    { key: 'all',      label_en: 'All',      label_fr: 'Tout'      },
    { key: 'food',     label_en: 'Food',     label_fr: 'Restau'    },
    { key: 'fitness',  label_en: 'Fitness',  label_fr: 'Sport'     },
    { key: 'shopping', label_en: 'Shopping', label_fr: 'Courses'   },
    { key: 'services', label_en: 'Services', label_fr: 'Services'  },
  ];

  if (nearbyVenues.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Section header */}
      <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, paddingHorizontal: 20, marginBottom: 10 }}>
        {t('Near You Now', 'Près de vous maintenant')}
      </Text>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, marginBottom: 12 }}
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
      <View style={{ paddingHorizontal: 20, gap: 8 }}>
        {filteredVenues.length === 0 ? (
          <Text style={{ fontSize: fonts.sm, color: colours.muted, paddingVertical: 8 }}>
            {t('No venues nearby in this category', 'Aucun établissement dans cette catégorie')}
          </Text>
        ) : (
          filteredVenues.map(venue => {
            const walkKm = haversineKm(userLat, userLng, venue.lat, venue.lng);
            const todayDeal = venue.deals.find(d => d.days.includes(todayDow)) ?? null;
            return (
              <TouchableOpacity
                key={`${venue.lat},${venue.lng}`}
                activeOpacity={0.7}
                onPress={() => onPressVenue(venue)}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colours.border,
                  backgroundColor: colours.surface,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                      {venue.name}
                    </Text>
                    {/* Type badges */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {venue.type.map(tp => (
                        <View
                          key={tp}
                          style={{
                            borderRadius: 6,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            backgroundColor: colours.accent + '18',
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '600', color: colours.accent }}>
                            {TYPE_LABELS[tp] ?? tp}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {/* Today's deal */}
                    {todayDeal && (
                      <Text style={{ fontSize: fonts.sm, color: colours.accent, marginTop: 5 }} numberOfLines={2}>
                        {todayDeal.description}
                      </Text>
                    )}
                  </View>
                  {/* Walk distance */}
                  <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                    {formatWalkDist(walkKm)} {t('walk', 'marche')}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}
