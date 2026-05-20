import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

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
      router.replace('/(tabs)/' as any);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colours.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 32, justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colours.text, marginBottom: 8 }}>
          Set up your profile
        </Text>
        <Text style={{ fontSize: 15, color: colours.muted, marginBottom: 40, lineHeight: 22 }}>
          This is how your friends will find you on The Wall.
        </Text>

        {/* Username */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Username
        </Text>
        <TextInput
          style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colours.text, marginBottom: 24 }}
          placeholder="e.g. eddie_ott"
          placeholderTextColor={colours.muted}
          value={username}
          onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Display name */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Display Name
        </Text>
        <TextInput
          style={{ backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colours.text, marginBottom: 24 }}
          placeholder="e.g. Eddie"
          placeholderTextColor={colours.muted}
          value={displayName}
          onChangeText={setDisplayName}
        />

        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || !username.trim()}
          style={{ backgroundColor: username.trim() ? colours.accent : colours.border, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Let's go</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
