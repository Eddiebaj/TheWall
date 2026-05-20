import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Venue {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface Event {
  id: string;
  title: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function UploadModal({ visible, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [video, setVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');

  const [nearestVenue, setNearestVenue] = useState<Venue | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [venueOverride, setVenueOverride] = useState(false);
  const [venueSearch, setVenueSearch] = useState('');
  const [venueResults, setVenueResults] = useState<Venue[]>([]);

  const [detectedEvent, setDetectedEvent] = useState<Event | null>(null);

  const [friendSearch, setFriendSearch] = useState('');
  const [friendResults, setFriendResults] = useState<Profile[]>([]);
  const [taggedFriends, setTaggedFriends] = useState<Profile[]>([]);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setVideo(null);
      setCaption('');
      setNearestVenue(null);
      setVenueOverride(false);
      setVenueSearch('');
      setVenueResults([]);
      setDetectedEvent(null);
      setFriendSearch('');
      setFriendResults([]);
      setTaggedFriends([]);
      detectLocation();
    }
  }, [visible]);

  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;

      const { data: venues } = await supabase
        .from('venues')
        .select('id, name, latitude, longitude');

      if (!venues || venues.length === 0) return;

      let nearest: Venue | null = null;
      let minDist = Infinity;
      for (const v of venues as Venue[]) {
        if (v.latitude == null || v.longitude == null) continue;
        const d = haversineKm(latitude, longitude, v.latitude, v.longitude);
        if (d < minDist) {
          minDist = d;
          nearest = v;
        }
      }
      // Fallback if no venues have coords
      if (!nearest) nearest = venues[0] as Venue;

      setNearestVenue(nearest);
      fetchEventForVenue(nearest.id);
    } catch {
      // silently ignore location errors
    } finally {
      setLocationLoading(false);
    }
  };

  const fetchEventForVenue = async (venueId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const { data } = await supabase
      .from('events')
      .select('id, title')
      .eq('venue_id', venueId)
      .gte('event_date', today)
      .lte('event_date', nextWeek.toISOString().split('T')[0])
      .order('event_date', { ascending: true })
      .limit(1)
      .single();

    setDetectedEvent(data ? (data as Event) : null);
  };

  // Venue search debounce
  useEffect(() => {
    if (!venueOverride || venueSearch.trim().length < 1) {
      setVenueResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name, latitude, longitude')
        .ilike('name', `%${venueSearch}%`)
        .limit(5);
      setVenueResults((data as Venue[]) || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [venueSearch, venueOverride]);

  // Friend search debounce
  useEffect(() => {
    if (friendSearch.trim().length < 1) {
      setFriendResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${friendSearch}%`)
        .neq('id', user?.id ?? '')
        .limit(8);
      const filtered = ((data as Profile[]) || []).filter(
        p => !taggedFriends.some(t => t.id === p.id)
      );
      setFriendResults(filtered);
    }, 300);
    return () => clearTimeout(timer);
  }, [friendSearch, taggedFriends, user?.id]);

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 15,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setVideo(result.assets[0]);
    }
  };

  const selectVenueOverride = (venue: Venue) => {
    setNearestVenue(venue);
    setVenueOverride(false);
    setVenueSearch('');
    setVenueResults([]);
    fetchEventForVenue(venue.id);
  };

  const tagFriend = (profile: Profile) => {
    setTaggedFriends(prev => [...prev, profile]);
    setFriendSearch('');
    setFriendResults([]);
  };

  const untagFriend = (id: string) => {
    setTaggedFriends(prev => prev.filter(p => p.id !== id));
  };

  const handleUpload = async () => {
    if (!video || !user) return;
    setUploading(true);
    try {
      const timestamp = Date.now();
      const path = `${user.id}/${timestamp}.mp4`;

      const response = await fetch(video.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(path, blob, { contentType: 'video/mp4' });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('posts').getPublicUrl(path);

      const { error: insertError } = await supabase.from('posts').insert({
        user_id: user.id,
        event_id: detectedEvent?.id || null,
        venue_id: nearestVenue?.id || null,
        video_url: publicUrl,
        caption: caption.trim() || null,
        duration: video.duration ? Math.round(video.duration / 1000) : null,
        tagged_users: taggedFriends.map(f => f.id),
      });
      if (insertError) throw insertError;

      onSuccess();
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#111' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={onClose} disabled={uploading}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Moment</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Step 1: Video picker / thumbnail */}
          {video ? (
            <TouchableOpacity
              style={styles.thumbnailContainer}
              onPress={pickVideo}
              activeOpacity={0.85}
              disabled={uploading}
            >
              <Video
                source={{ uri: video.uri }}
                style={styles.thumbnail}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                isMuted
                positionMillis={0}
              />
              <View style={styles.thumbnailOverlay}>
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={styles.thumbnailChangeText}>Change video</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.videoPicker}
              onPress={pickVideo}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <Ionicons name="videocam-outline" size={40} color="rgba(255,255,255,0.4)" />
              <Text style={styles.videoEmptyText}>Tap to pick a video</Text>
              <Text style={styles.videoEmptyHint}>Max 15 seconds</Text>
            </TouchableOpacity>
          )}

          {/* Caption */}
          <TextInput
            style={styles.captionInput}
            placeholder="What's the vibe?"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={200}
            editable={!uploading}
          />

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Location</Text>

            {locationLoading ? (
              <View style={styles.locationRow}>
                <ActivityIndicator size="small" color="#FF3B5C" />
                <Text style={styles.locationLoadingText}>Detecting location...</Text>
              </View>
            ) : venueOverride ? (
              <View>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search venues..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={venueSearch}
                  onChangeText={setVenueSearch}
                  autoFocus
                />
                {venueResults.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.resultRow}
                    onPress={() => selectVenueOverride(v)}
                  >
                    <Ionicons name="location-sharp" size={15} color="#FF3B5C" />
                    <Text style={styles.resultText}>{v.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setVenueOverride(false)} style={styles.cancelLink}>
                  <Text style={styles.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.locationRow}>
                <Ionicons name="location-sharp" size={16} color="#FF3B5C" style={{ marginRight: 6 }} />
                <Text style={styles.locationText}>
                  {nearestVenue ? nearestVenue.name : 'No venue detected'}
                </Text>
                <TouchableOpacity onPress={() => setVenueOverride(true)}>
                  <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Auto-detected event */}
            {detectedEvent && !venueOverride && (
              <View style={styles.eventDetected}>
                <Ionicons name="musical-notes-outline" size={13} color="#FF3B5C" />
                <Text style={styles.eventDetectedText} numberOfLines={1}>
                  {detectedEvent.title}
                </Text>
                <TouchableOpacity onPress={() => setDetectedEvent(null)}>
                  <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Tag friends */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Tag friends</Text>

            {taggedFriends.length > 0 && (
              <View style={styles.chipsRow}>
                {taggedFriends.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.chip}
                    onPress={() => untagFriend(p.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.chipAvatar}>
                      <Text style={styles.chipAvatarText}>
                        {p.username[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.chipText}>@{p.username}</Text>
                    <Ionicons name="close" size={12} color="rgba(255,255,255,0.45)" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TextInput
              style={styles.searchInput}
              placeholder="Search by username..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={friendSearch}
              onChangeText={setFriendSearch}
              editable={!uploading}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {friendResults.map(p => (
              <TouchableOpacity
                key={p.id}
                style={styles.resultRow}
                onPress={() => tagFriend(p)}
              >
                <View style={styles.resultAvatar}>
                  <Text style={styles.chipAvatarText}>{p.username[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.resultText}>@{p.username}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Upload button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.uploadBtn, (!video || uploading) && styles.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={!video || uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.uploadBtnText}>Upload</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  videoPicker: {
    height: 200,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 8,
    marginBottom: 16,
  },
  videoEmptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
  },
  videoEmptyHint: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 12,
  },
  thumbnailContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#000',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  thumbnailChangeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  captionInput: {
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationLoadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginLeft: 10,
  },
  locationText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  changeText: {
    color: '#FF3B5C',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
  },
  eventDetected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
    backgroundColor: 'rgba(255,59,92,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  eventDetectedText: {
    color: '#FF3B5C',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  searchInput: {
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  resultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF3B5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  cancelLink: {
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  cancelLinkText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#111',
  },
  uploadBtn: {
    backgroundColor: '#FF3B5C',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  uploadBtnDisabled: { opacity: 0.38 },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
