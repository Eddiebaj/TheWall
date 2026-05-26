import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const confirmRef = useRef<TextInput>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = password.length >= 6 && confirm.length >= 1 && !loading;

  const handleReset = async () => {
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Please make sure both fields are the same.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace('/(tabs)/index' as any);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0a0a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8 }}>
          Reset your password
        </Text>
        <Text style={{ fontSize: 15, color: '#999', textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
          Enter a new password for your account.
        </Text>

        {/* New password */}
        <View style={{ width: '100%', marginBottom: 12 }}>
          <TextInput
            style={{
              width: '100%',
              backgroundColor: '#1a1a1a',
              borderWidth: 1,
              borderColor: '#2a2a2a',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingRight: 52,
              paddingVertical: 14,
              fontSize: 16,
              color: '#fff',
            }}
            placeholder="New password"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(v => !v)}
            style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, color: '#666', fontWeight: '600' }}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Confirm password */}
        <TextInput
          ref={confirmRef}
          style={{
            width: '100%',
            backgroundColor: '#1a1a1a',
            borderWidth: 1,
            borderColor: '#2a2a2a',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 16,
            color: '#fff',
            marginBottom: 24,
          }}
          placeholder="Confirm new password"
          placeholderTextColor="#555"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleReset}
        />

        <TouchableOpacity
          onPress={handleReset}
          disabled={!canSubmit}
          style={{
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: 14,
            paddingVertical: 17,
            alignItems: 'center',
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>Set New Password</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
