import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Modal, ScrollView, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { haversineKm } from '../lib/geo';
import { HAPPY_HOUR_VENUES, HappyHourVenue } from '../lib/happyHourData';
import { NeighbourhoodGroup } from '../lib/neighbourhoodGroups';
import { SK_JOINED_GROUPS } from '../lib/storageKeys';
import { addAndSave, TASTE_POINTS } from '../lib/tasteProfile';

function activeNow(venue: HappyHourVenue): boolean {
  const now = new Date();
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  return venue.deals.some(d => {
    if (!d.days.includes(dow)) return false;
    const [sh, sm] = d.start.split(':').map(Number);
    const [eh, em] = d.end.split(':').map(Number);
    return mins >= sh * 60 + sm && mins <= eh * 60 + em;
  });
}

type Props = {
  group: NeighbourhoodGroup | null;
  visible: boolean;
  onClose: () => void;
  joinedGroups: string[];
  onJoinedGroupsChange: (groups: string[]) => void;
};

export default function GroupFeedSheet({ group, visible, onClose, joinedGroups, onJoinedGroupsChange }: Props) {
  const { colours, t, fonts, language, resolvedTheme } = useApp();
  const isLight = resolvedTheme === 'light';
  const insets = useSafeAreaInsets();

  const isJoined = group ? joinedGroups.includes(group.id) : false;
  const [communityDeals, setCommunityDeals] = useState<{ id: string; venue_name: string; deal_description: string }[]>([]);

  useEffect(() => {
    if (!group) return;
    supabase
      .from('community_deals')
      .select('id, venue_name, deal_description')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setCommunityDeals(data); })
      .catch(() => {});
  }, [group?.id]);

  const toggleJoin = async () => {
    if (!group) return;
    let updated: string[];
    if (isJoined) {
      updated = joinedGroups.filter(id => id !== group.id);
    } else {
      updated = [...joinedGroups, group.id];
      addAndSave('neighbourhoods', group.name_en, TASTE_POINTS.group_join);
    }
    onJoinedGroupsChange(updated);
    await AsyncStorage.setItem(SK_JOINED_GROUPS, JSON.stringify(updated)).catch(() => {});
  };

  if (!group) return null;

  const nearbyVenues = HAPPY_HOUR_VENUES.filter(v =>
    haversineKm(group.lat, group.lng, v.lat, v.lng) <= group.radiusKm
  );
  const activeVenues = nearbyVenues.filter(activeNow);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

        {/* Header */}
        <View style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: colours.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}>
          <View style={{
            width: 38, height: 38, borderRadius: 12,
            backgroundColor: group.color + '20',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={group.icon as any} size={18} color={group.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fonts.lg, fontWeight: '700', color: colours.text }}>
              {language === 'fr' ? group.name_fr : group.name_en}
            </Text>
            <Text style={{ fontSize: 11, color: colours.muted }}>
              {nearbyVenues.length} {t('venues', 'etablissements')} · {group.radiusKm}km
            </Text>
          </View>
          <TouchableOpacity
            onPress={toggleJoin}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
              backgroundColor: isJoined ? group.color + '18' : group.color,
              borderWidth: 1,
              borderColor: group.color,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: isJoined ? group.color : '#fff' }}>
              {isJoined ? t('Joined', 'Rejoint') : t('Join', 'Rejoindre')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colours.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

          {/* Active happy hour deals now */}
          {activeVenues.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 18, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#22c55e' }}>
                  {t('ACTIVE NOW', 'ACTIF MAINTENANT')}
                </Text>
              </View>
              {activeVenues.map(v => (
                <View
                  key={v.name}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: 12, marginBottom: 8,
                    borderWidth: 1, borderColor: '#22c55e40',
                    backgroundColor: '#22c55e08',
                  }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#22c55e18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="pricetag" size={15} color="#22c55e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>{v.name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }} numberOfLines={1}>
                      {v.deals.filter(d => d.days.includes(new Date().getDay())).map(d => language === 'fr' ? d.description_fr : d.description).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#22c55e18', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#22c55e' }}>{t('NOW', 'MAINTENANT')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* All venues in this area */}
          {nearbyVenues.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: activeVenues.length > 0 ? 8 : 18, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
                {t('VENUES IN THIS AREA', 'ETABLISSEMENTS DANS CE SECTEUR')}
              </Text>
              {nearbyVenues.map(v => (
                <View
                  key={v.name}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: 12, marginBottom: 8,
                    borderWidth: 1, borderColor: colours.border,
                    backgroundColor: colours.surface,
                  }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colours.tintBg || group.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="restaurant" size={15} color={group.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }}>{v.name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }}>
                      {v.deals.length} {t('deals', 'offres')}
                    </Text>
                  </View>
                  {activeNow(v) && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Community deals  -  approved deals from Supabase */}
          {communityDeals.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 10 }}>
                {t('COMMUNITY DEALS', 'OFFRES COMMUNAUTAIRES')}
              </Text>
              {communityDeals.map(deal => (
                <View
                  key={deal.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: 12, marginBottom: 8,
                    borderWidth: 1, borderColor: colours.border,
                    backgroundColor: colours.surface,
                  }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="pricetag" size={15} color={colours.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{deal.venue_name}</Text>
                    <Text style={{ fontSize: 11, color: colours.muted, marginTop: 1 }} numberOfLines={2}>{deal.deal_description}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
