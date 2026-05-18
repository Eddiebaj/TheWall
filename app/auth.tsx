import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const { signInWithEmail } = useAuth();
  const { colours } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await signInWithEmail(email.trim().toLowerCase());
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setOtp('');
      setSent(true);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp,
      type: 'email',
    });
    setVerifying(false);
    if (error) {
      Alert.alert('Invalid code', error.message);
    }
    // On success, onAuthStateChange in AuthContext fires and _layout routes automatically
  };

  if (sent) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colours.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 24 }}>📬</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colours.text, textAlign: 'center', marginBottom: 12 }}>
            Check your email
          </Text>
          <Text style={{ fontSize: 15, color: colours.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            Enter the 6-digit code we sent to {email}
          </Text>

          <TextInput
            style={{
              width: '100%',
              backgroundColor: colours.surface,
              borderWidth: 1,
              borderColor: colours.border,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 28,
              fontWeight: '700',
              color: colours.text,
              textAlign: 'center',
              letterSpacing: 8,
              marginBottom: 12,
            }}
            placeholder="000000"
            placeholderTextColor={colours.muted}
            value={otp}
            onChangeText={t => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={verifyOtp}
          />

          <TouchableOpacity
            onPress={verifyOtp}
            disabled={verifying || otp.length !== 6}
            style={{
              width: '100%',
              backgroundColor: otp.length === 6 ? colours.accent : colours.border,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            {verifying ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSignIn} disabled={loading}>
            <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '600' }}>
              {loading ? 'Sending…' : 'Resend email'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setSent(false); setOtp(''); }}
            style={{ marginTop: 16 }}
          >
            <Text style={{ fontSize: 14, color: colours.muted }}>Use a different email</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colours.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {/* Logo */}
        <Text style={{ fontSize: 40, fontWeight: '800', color: colours.text, letterSpacing: -1, marginBottom: 8 }}>
          The <Text style={{ color: colours.accent }}>Wall</Text>
        </Text>
        <Text style={{ fontSize: 14, color: colours.muted, letterSpacing: 2, marginBottom: 48 }}>
          Toronto's social event wall
        </Text>

        <Text style={{ fontSize: 22, fontWeight: '800', color: colours.text, marginBottom: 8, textAlign: 'center' }}>
          Join your friends on The Wall
        </Text>
        <Text style={{ fontSize: 15, color: colours.muted, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
          Enter your email and we'll send you a magic link to sign in.
        </Text>

        <TextInput
          style={{
            width: '100%',
            backgroundColor: colours.surface,
            borderWidth: 1,
            borderColor: colours.border,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 16,
            color: colours.text,
            marginBottom: 12,
          }}
          placeholder="your@email.com"
          placeholderTextColor={colours.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleSignIn}
          returnKeyType="go"
        />

        <TouchableOpacity
          onPress={handleSignIn}
          disabled={loading || !email.trim()}
          style={{
            width: '100%',
            backgroundColor: email.trim() ? colours.accent : colours.border,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>
              Send Magic Link
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(tabs)/map' as any)}>
          <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '600' }}>
            Continue without account
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
