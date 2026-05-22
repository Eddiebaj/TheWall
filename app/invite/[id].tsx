import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { SK_INVITED_BY } from '../../lib/storageKeys';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colours } = useApp();

  useEffect(() => {
    if (id) {
      AsyncStorage.setItem(SK_INVITED_BY, id).catch(() => {});
    }
  }, [id]);

  const handleSignUp = () => {
    router.replace('/auth');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg, paddingTop: insets.top, paddingBottom: insets.bottom, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ width: 96, height: 96, borderRadius: 22, marginBottom: 24 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 28, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 12 }}>
        affiche
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colours.text, textAlign: 'center', marginBottom: 8 }}>
        You've been invited to join!
      </Text>
      <Text style={{ fontSize: 15, color: colours.muted, textAlign: 'center', marginBottom: 48, lineHeight: 22 }}>
        Share moments, discover events, and stay connected with your crew.
      </Text>
      <TouchableOpacity
        onPress={handleSignUp}
        style={{ backgroundColor: colours.accent, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center', width: '100%' }}
        activeOpacity={0.85}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Sign Up</Text>
      </TouchableOpacity>
    </View>
  );
}
