import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { SK_FOLLOWED_VENUES } from '../lib/storageKeys';

export type CommunityDealItem = {
  id: string;
  venue_name: string;
  deal_text: string;
  day_of_week: number;
  submitted_at?: string;
  early_access?: boolean;
};

interface Props {
  communityDeals?: CommunityDealItem[];
  onPressDeal?: (deal: CommunityDealItem) => void;
}

export default function FromTheCommunitySection({ communityDeals, onPressDeal }: Props) {
  const { colours, fonts, t, language } = useApp();
  const [followedVenues, setFollowedVenues] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SK_FOLLOWED_VENUES).then(raw => {
      if (raw) setFollowedVenues(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  if (!communityDeals || communityDeals.length === 0) return null;

  const todayDow = new Date().getDay();
  const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const dayNames = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;

  const toggleFollow = async (venueName: string) => {
    const updated = followedVenues.includes(venueName)
      ? followedVenues.filter(v => v !== venueName)
      : [...followedVenues, venueName];
    setFollowedVenues(updated);
    await AsyncStorage.setItem(SK_FOLLOWED_VENUES, JSON.stringify(updated)).catch(() => {});
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, paddingHorizontal: 20, marginBottom: 10 }}>
        {t('From the Community', 'De la communauté')}
      </Text>

      <View style={{ paddingHorizontal: 20, gap: 8 }}>
        {communityDeals.map(deal => {
          const isToday = deal.day_of_week === todayDow;
          const isFollowed = followedVenues.includes(deal.venue_name);
          return (
            <TouchableOpacity
              key={deal.id}
              activeOpacity={0.7}
              onPress={() => onPressDeal?.(deal)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: isToday ? '#22c55e40' : colours.border,
                backgroundColor: isToday ? '#22c55e08' : colours.surface,
              }}
            >
              {/* Icon */}
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: isToday ? '#22c55e18' : colours.tintBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name="pricetag" size={16} color={isToday ? '#22c55e' : colours.accent} />
              </View>

              {/* Text */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>
                  {deal.venue_name}
                </Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }} numberOfLines={1}>
                  {deal.deal_text}
                </Text>
              </View>

              {/* Follow heart */}
              <TouchableOpacity
                onPress={() => toggleFollow(deal.venue_name)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Ionicons
                  name={isFollowed ? 'heart' : 'heart-outline'}
                  size={18}
                  color={isFollowed ? '#EC4899' : colours.muted}
                />
              </TouchableOpacity>

              {/* Day badge */}
              <View style={{
                backgroundColor: isToday ? '#22c55e18' : colours.bg,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: isToday ? '#22c55e40' : colours.border,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: isToday ? '#22c55e' : colours.muted }}>
                  {isToday ? t('TODAY', "AUJOURD'HUI") : dayNames[deal.day_of_week]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
