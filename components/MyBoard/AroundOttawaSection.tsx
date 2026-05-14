import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { supabase } from '../../lib/supabase';

function PlaceCard({ place, colours, t, onSaveToggle, sponsoredIds }: { place: any; colours: any; t: (en: string, fr: string) => string; onSaveToggle?: () => void; sponsoredIds: string[] }) {
  const isSponsored = sponsoredIds.includes(place.place_id);
  const [saved, setSaved] = React.useState(false);
  const [friendSaveCount, setFriendSaveCount] = useState(0);
  const [friendNames, setFriendNames] = useState<string[]>([]);
  const [rsvpCount, setRsvpCount] = useState(0);
  useEffect(() => {
    supabase
      .from('city_board_rsvps')
      .select('id', { count: 'exact' })
      .eq('venue_name', place.name)
      .gt('expires_at', new Date().toISOString())
      .then(({ count }) => setRsvpCount(count ?? 0));
  }, [place.name]);

  React.useEffect(() => {
    AsyncStorage.getItem('routeo_saved_places').then(val => {
      const places = JSON.parse(val || '[]');
      setSaved(places.some((p: any) => p.id === (place.place_id || place.name)));
    });
  }, []);

  useEffect(() => {
    const loadFriendSaves = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (!friendships?.length) return;
      const friendIds = friendships.map(f =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      );

      const { data: saves } = await supabase
        .from('user_saved_places')
        .select('user_id, profiles(display_name, username)')
        .eq('place_id', place.place_id || place.name)
        .in('user_id', friendIds);

      if (saves?.length) {
        setFriendSaveCount(saves.length);
        setFriendNames(saves.map((s: any) => s.profiles?.display_name || s.profiles?.username).filter(Boolean));
      }
    };
    loadFriendSaves();
  }, [place.place_id]);

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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (saved) {
        await supabase.from('user_saved_places').delete()
          .eq('user_id', user.id).eq('place_id', place.place_id || place.name);
      } else {
        await supabase.from('user_saved_places').upsert({
          user_id: user.id,
          place_id: place.place_id || place.name,
          place_name: place.name,
        }, { onConflict: 'user_id,place_id' });
      }
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
        {isSponsored && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#e8a020', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: 'white', textTransform: 'uppercase', letterSpacing: 0.5 }}>Featured</Text>
          </View>
        )}
        {!isSponsored && place.opening_hours?.open_now !== undefined && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: place.opening_hours.open_now ? '#00A78D' : '#cc3b2a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: 'white' }}>
              {place.opening_hours.open_now ? t('Open', 'Ouvert') : t('Closed', 'Fermé')}
            </Text>
          </View>
        )}
        {place.geometry?.location && (
          <View style={{ position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="bus-outline" size={9} color="white" />
            <Text style={{ fontSize: 9, fontWeight: '700', color: 'white' }}>
              {Math.round(Math.sqrt(Math.pow((place.geometry.location.lat - 45.4215) * 111, 2) + Math.pow((place.geometry.location.lng - (-75.6972)) * 111 * 0.69, 2)) * 3)} min
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
        <TouchableOpacity
          onPress={async e => {
            e.stopPropagation();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('city_board_rsvps').upsert({
              user_id: user.id,
              venue_name: place.name,
              venue_lat: place.geometry?.location?.lat ?? null,
              venue_lng: place.geometry?.location?.lng ?? null,
              event_type: 'going',
              expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: 'user_id,venue_name' });
          }}
          style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colours.accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
        >
          <Ionicons name="flame-outline" size={11} color={colours.accent} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>{rsvpCount > 0 ? `${rsvpCount} going` : t("I'm going", "J'y vais")}</Text>
        </TouchableOpacity>
        {friendSaveCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Ionicons name="people" size={10} color={colours.accent} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: colours.accent }}>
              {friendSaveCount === 1 ? `${friendNames[0]} saved this` : `${friendSaveCount} friends saved this`}
            </Text>
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
  const [sponsoredIds, setSponsoredIds] = useState<string[]>([]);
  const [wallPosts, setWallPosts] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from('sponsored_venues')
      .select('place_id, place_name, expires_at, boost_type')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .then(({ data }) => {
        if (data) setSponsoredIds(data.map((v: any) => v.place_id).filter(Boolean));
      });
  }, []);

  useEffect(() => {
    supabase
      .from('city_board_posts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setWallPosts(data || []));
  }, []);

  React.useEffect(() => {
    setAoLoading(true);
    const type = 'bar|restaurant|night_club';
    fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=nearby&location=45.4215,-75.6972&radius=1500&type=${type}`)
      .then(r => r.json())
      .then(d => {
        console.log('[Places]', (d.results || []).slice(0, 3).map((p: any) => ({ name: p.name, place_id: p.place_id })));
        const sorted = [...(d.results || [])].sort((a, b) => {
          const aSponsored = sponsoredIds.includes(a.place_id) || sponsoredIds.includes(a.name);
          const bSponsored = sponsoredIds.includes(b.place_id) || sponsoredIds.includes(b.name);
          return bSponsored ? 1 : aSponsored ? -1 : 0;
        });
        let filtered = sorted;
        if (aoCategory === 'tonight') {
          filtered = sorted.filter((p: any) => p.opening_hours?.open_now === true);
        }
        setAoPlaces(filtered.slice(0, 10));
      })
      .catch(() => setAoPlaces([]))
      .finally(() => setAoLoading(false));
  }, [aoCategory]);

  const categories = [
    { key: 'all', label: 'All' },
    { key: 'tonight', label: 'Tonight' },
    { key: 'this_week', label: 'This Week' },
  ];

  return (
    <View style={{ paddingTop: 20, paddingBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 }}>
        {t('THE WALL', 'THE WALL')}
      </Text>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.key}
            onPress={() => setAoCategory(cat.key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, backgroundColor: aoCategory === cat.key ? colours.accent : colours.surface, borderColor: aoCategory === cat.key ? colours.accent : colours.border }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: aoCategory === cat.key ? 'white' : colours.text }}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Places */}
      {aoLoading ? (
        <ActivityIndicator color={colours.accent} style={{ marginTop: 20 }} />
      ) : (
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {wallPosts.map(post => (
            <TouchableOpacity
              key={post.id}
              style={{ width: '46%', borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.accent + '40', overflow: 'hidden' }}
              onPress={() => post.ticket_url && Linking.openURL(post.ticket_url).catch(() => {})}
              activeOpacity={0.85}
            >
              {post.poster_url ? (
                <Image source={{ uri: post.poster_url }} style={{ width: '100%', aspectRatio: 0.75 }} resizeMode="cover" />
              ) : (
                <View style={{ width: '100%', aspectRatio: 0.75, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="ticket-outline" size={32} color={colours.accent} />
                </View>
              )}
              <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: colours.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: 'white' }}>ON THE WALL</Text>
              </View>
              <View style={{ padding: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text }} numberOfLines={1}>{post.venue_name}</Text>
                {post.event_title && <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{post.event_title}</Text>}
                {post.event_date && <Text style={{ fontSize: 10, color: colours.accent, marginTop: 2 }}>{post.event_date}</Text>}
              </View>
            </TouchableOpacity>
          ))}
          {aoPlaces.map((place, i) => (
            <PlaceCard key={place.place_id || i} place={place} colours={colours} t={t} onSaveToggle={onSaveToggle} sponsoredIds={sponsoredIds} />
          ))}
        </View>
      )}
    </View>
  );
}
