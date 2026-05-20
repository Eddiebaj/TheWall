import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export default function ProfileSetupScreen() {
  const { profile, updateProfile } = useAuth();
  const { colours } = useApp();
  const router = useRouter();
  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Username required', 'Please choose a username.');
      return;
    }
    if (username.includes(' ')) {
      Alert.alert('Invalid username', 'Username cannot contain spaces.');
      return;
    }
    setLoading(true);
    const { error } = await updateProfile({
      username: username.trim().toLowerCase(),
      display_name: displayName.trim() || username.trim(),
    });
    setLoading(false);
    if (error) {
      if (error.message?.includes('unique')) {
        Alert.alert('Username taken', 'That username is already taken. Try another.');
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      await AsyncStorage.setItem('thewall_profile_setup_done', 'true');
      // Auto-send friend request to inviter if present
      try {
        const inviterId = await AsyncStorage.getItem('thewall_invited_by');
        const { data: { user } } = await supabase.auth.getUser();
        if (inviterId && user && inviterId !== user.id) {
          await supabase.from('friendships').insert({
            requester_id: user.id,
            addressee_id: inviterId,
            status: 'pending',
          });
          await AsyncStorage.removeItem('thewall_invited_by');
        }
      } catch {
        // Non-fatal: ignore errors silently
      }
      router.replace('/(tabs)/' as any);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0a0a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 32, justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 }}>
          Set up your profile
        </Text>
        <Text style={{ fontSize: 16, color: '#999', marginBottom: 40, lineHeight: 24 }}>
          This is how your friends will find you on The Wall.
        </Text>

        {/* Username */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Username
        </Text>
        <TextInput
          style={{ backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#eef2f7', marginBottom: 24 }}
          placeholder="e.g. eddie_ott"
          placeholderTextColor="#555"
          value={username}
          onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Display name */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Display Name
        </Text>
        <TextInput
          style={{ backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#eef2f7', marginBottom: 24 }}
          placeholder="e.g. Eddie"
          placeholderTextColor="#555"
          value={displayName}
          onChangeText={setDisplayName}
        />

        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || !username.trim()}
          style={{ backgroundColor: username.trim() ? '#fff' : '#2a2a2a', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          {loading ? <ActivityIndicator color={username.trim() ? '#000' : '#666'} /> : <Text style={{ fontSize: 16, fontWeight: '700', color: username.trim() ? '#000' : '#555' }}>Let's go</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
