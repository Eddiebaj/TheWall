import React, { useRef, useState } from 'react';
import { Animated, TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
let Video: any = null;
let ResizeMode: any = { COVER: 'cover' };
let ImagePicker: any = null;
try { const av = require('expo-av'); Video = av.Video; ResizeMode = av.ResizeMode; } catch {}
try { ImagePicker = require('expo-image-picker'); } catch {}
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Props {
  rsvp: any;
  scan: any;
  memory: any;
  colours: any;
  fonts: any;
  onMemoryAdded: () => void;
}

export default function FlipPoster({ rsvp, scan, memory, colours, fonts, onMemoryAdded }: Props) {
  const { user } = useAuth();
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);
  const [uploading, setUploading] = useState(false);

  const flip = () => {
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const addMemory = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'mp4';
      const path = `memories/${user!.id}/${rsvp.venue_name.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('poster-memories')
        .upload(path, blob, { contentType: `video/${ext}` });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('poster-memories')
        .getPublicUrl(path);

      await supabase.from('poster_memories').upsert({
        user_id: user!.id,
        venue_name: rsvp.venue_name,
        video_url: publicUrl,
      }, { onConflict: 'user_id,venue_name' });

      onMemoryAdded();
    } catch (e) {
      Alert.alert('Error', 'Could not upload memory. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity onPress={flip} activeOpacity={0.9} style={{ width: '47%', aspectRatio: 0.75 }}>
      {/* Front */}
      <Animated.View style={{
        position: 'absolute', width: '100%', height: '100%',
        borderRadius: 12, backgroundColor: colours.surface,
        borderWidth: 1, borderColor: colours.accent + '60',
        overflow: 'hidden', backfaceVisibility: 'hidden',
        transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="ticket" size={28} color={colours.accent} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text, marginTop: 8, textAlign: 'center', paddingHorizontal: 8 }} numberOfLines={2}>
          {rsvp.venue_name}
        </Text>
        <Text style={{ fontSize: 9, color: colours.muted, marginTop: 4 }}>Tap to flip</Text>
      </Animated.View>

      {/* Back */}
      <Animated.View style={{
        position: 'absolute', width: '100%', height: '100%',
        borderRadius: 12, backgroundColor: '#0a0a0a',
        borderWidth: 1, borderColor: colours.accent,
        overflow: 'hidden', backfaceVisibility: 'hidden',
        transform: [{ perspective: 1000 }, { rotateY: backRotate }],
        alignItems: 'center', justifyContent: 'center',
      }}>
        {memory?.video_url ? (
          <Video
            source={{ uri: memory.video_url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isFlipped}
            isLooping
            isMuted={false}
          />
        ) : (
          <TouchableOpacity
            onPress={uploading ? undefined : addMemory}
            style={{ alignItems: 'center', padding: 16 }}
          >
            <Ionicons name={uploading ? 'hourglass-outline' : 'add-circle-outline'} size={32} color={colours.accent} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent, marginTop: 8, textAlign: 'center' }}>
              {uploading ? 'Uploading...' : 'Add Memory'}
            </Text>
            <Text style={{ fontSize: 9, color: colours.muted, marginTop: 4, textAlign: 'center' }}>
              30 sec video from that night
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ position: 'absolute', bottom: 8, left: 8, right: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>Tap to flip back</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}
