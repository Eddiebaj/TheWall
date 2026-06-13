import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SK_INVITED_BY } from '../lib/storageKeys';

export default function ProfileSetupScreen() {
  const { profile, updateProfile } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [usernameError, setUsernameError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);

  const validateUsername = (value: string): string => {
    if (value.length < 3) return 'Username must be at least 3 characters.';
    if (value.length > 20) return 'Username must be 20 characters or fewer.';
    if (!/^[a-z0-9_]+$/.test(value)) return 'Only letters, numbers, and underscores allowed.';
    return '';
  };

  const handleUsernameChange = (t: string) => {
    const cleaned = t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    setUsername(cleaned);
    const err = cleaned.length > 0 ? validateUsername(cleaned) : '';
    setUsernameError(err);
    if (!err && cleaned.length >= 3) {
      setUsernameStatus('checking');
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
      usernameDebounceRef.current = setTimeout(async () => {
        const timeoutId = setTimeout(() => {
          setUsernameStatus('available');
          setUsernameError('Could not verify username, proceed anyway');
        }, 5000);
        try {
          const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', cleaned)
            .maybeSingle();
          clearTimeout(timeoutId);
          setUsernameStatus(data ? 'taken' : 'available');
          if (data) setUsernameError('Username already taken.');
          else setUsernameError('');
        } catch {
          clearTimeout(timeoutId);
          setUsernameStatus('available');
          setUsernameError('Could not verify username, proceed anyway');
        }
      }, 500);
    } else {
      setUsernameStatus('idle');
    }
  };

  const handleSave = async () => {
    const err = validateUsername(username);
    if (err) {
      setUsernameError(err);
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
      // SK_PROFILE_SETUP_DONE is written by neighbourhood.tsx at the end of the full
      // onboarding flow (alongside SK_ONBOARDING_COMPLETE), ensuring users reach the
      // interests and neighbourhood screens before being marked as fully onboarded.
      // Auto-send friend request to inviter if present
      try {
        const inviterId = await AsyncStorage.getItem(SK_INVITED_BY);
        if (inviterId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user && inviterId !== user.id) {
            // Verify the inviter is a real user before sending the request
            const { data: inviterProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', inviterId)
              .maybeSingle();
            if (inviterProfile) {
              await supabase.from('friendships').insert({
                requester_id: user.id,
                addressee_id: inviterId,
                status: 'pending',
              });
            }
          }
          await AsyncStorage.removeItem(SK_INVITED_BY);
        }
      } catch {
        // Non-fatal: ignore errors silently
      }
      router.replace('/onboarding/preferences' as any);
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
        <Text style={{ fontSize: 16, color: '#999', marginBottom: 32, lineHeight: 24 }}>
          This is how your friends will find you on Affiche.
        </Text>

        {/* Initials avatar preview */}
        {(() => {
          const initial = (displayName || username || '').trim()[0]?.toUpperCase() || '?';
          const colors = ['#5856D6','#FF2D55','#FF9500','#34C759','#007AFF','#AF52DE','#FF3B30'];
          const idx = initial.charCodeAt(0) % colors.length;
          return (
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors[idx], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30, fontWeight: '700', color: '#fff' }}>{initial}</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#555', marginTop: 8 }}>Your avatar</Text>
            </View>
          );
        })()}

        {/* Username */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Username
        </Text>
        <TextInput
          style={{ backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: usernameError ? '#e55' : '#2a2a2a', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#eef2f7', marginBottom: usernameError ? 6 : 24 }}
          placeholder="e.g. eddie_ott"
          placeholderTextColor="#555"
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        {usernameError ? (
          <Text style={{ fontSize: 13, color: '#e55', marginBottom: 18 }}>{usernameError}</Text>
        ) : usernameStatus === 'checking' ? (
          <Text style={{ fontSize: 13, color: '#999', marginBottom: 18 }}>Checking availability...</Text>
        ) : usernameStatus === 'available' ? (
          <Text style={{ fontSize: 13, color: '#4CAF50', marginBottom: 18 }}>Username available</Text>
        ) : null}

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
          disabled={loading || !username.trim() || !!usernameError || usernameStatus === 'checking' || usernameStatus === 'taken'}
          style={{ backgroundColor: username.trim() && !usernameError && usernameStatus !== 'taken' ? '#fff' : '#2a2a2a', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          {loading ? <ActivityIndicator color={username.trim() && !usernameError ? '#000' : '#666'} /> : <Text style={{ fontSize: 16, fontWeight: '700', color: username.trim() && !usernameError ? '#000' : '#555' }}>Let's go</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
