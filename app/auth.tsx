import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useAnalytics } from '../lib/analytics';

type Tab = 'email' | 'phone';

export default function AuthScreen() {
  const { signInWithEmail } = useAuth();
  const router = useRouter();
  const { capture } = useAnalytics();

  const [tab, setTab] = useState<Tab>('email');

  // Email state
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailVerifying, setEmailVerifying] = useState(false);

  // Phone state
  const [countryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  // ── Email handlers ──────────────────────────────────────────────

  const handleEmailSignIn = async () => {
    if (!email.trim()) return;
    setEmailLoading(true);
    const { error } = await signInWithEmail(email.trim().toLowerCase());
    setEmailLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEmailOtp('');
      setEmailSent(true);
    }
  };

  const verifyEmailOtp = async () => {
    if (emailOtp.length !== 6) return;
    setEmailVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: emailOtp,
      type: 'email',
    });
    setEmailVerifying(false);
    if (error) {
      Alert.alert('Invalid code', error.message);
    } else {
      const createdAt = data.user?.created_at;
      const isNew = createdAt && (Date.now() - new Date(createdAt).getTime()) < 30000;
      capture(isNew ? 'account_created' : 'login');
    }
  };

  // ── Phone handlers ──────────────────────────────────────────────

  const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`;

  const handlePhoneSignIn = async () => {
    if (phone.replace(/\D/g, '').length < 10) return;
    setPhoneLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setPhoneLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setPhoneOtp('');
      setPhoneSent(true);
    }
  };

  const verifyPhoneOtp = async () => {
    if (phoneOtp.length !== 6) return;
    setPhoneVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: fullPhone,
      token: phoneOtp,
      type: 'sms',
    });
    setPhoneVerifying(false);
    if (error) {
      Alert.alert('Invalid code', error.message);
    } else {
      const createdAt = data.user?.created_at;
      const isNew = createdAt && (Date.now() - new Date(createdAt).getTime()) < 30000;
      capture(isNew ? 'account_created' : 'login');
    }
  };

  // ── OTP verification screens ────────────────────────────────────

  if (emailSent) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 24 }}>📬</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 12 }}>
            Check your email
          </Text>
          <Text style={{ fontSize: 15, color: '#999', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            Enter the 6-digit code we sent to {email}
          </Text>

          <TextInput
            style={{
              width: '100%',
              backgroundColor: '#1a1a1a',
              borderWidth: 1,
              borderColor: '#2a2a2a',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 28,
              fontWeight: '700',
              color: '#fff',
              textAlign: 'center',
              letterSpacing: 8,
              marginBottom: 12,
            }}
            placeholder="000000"
            placeholderTextColor="#555"
            value={emailOtp}
            onChangeText={t => setEmailOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={verifyEmailOtp}
          />

          <TouchableOpacity
            onPress={verifyEmailOtp}
            disabled={emailVerifying || emailOtp.length !== 6}
            style={{
              width: '100%',
              backgroundColor: emailOtp.length === 6 ? '#fff' : '#2a2a2a',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            {emailVerifying ? (
              <ActivityIndicator color={emailOtp.length === 6 ? '#000' : '#666'} />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: emailOtp.length === 6 ? '#000' : '#555' }}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleEmailSignIn} disabled={emailLoading}>
            <Text style={{ fontSize: 14, color: '#999', fontWeight: '600' }}>
              {emailLoading ? 'Sending…' : 'Resend email'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setEmailSent(false); setEmailOtp(''); }}
            style={{ marginTop: 16 }}
          >
            <Text style={{ fontSize: 14, color: '#999' }}>Use a different email</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (phoneSent) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 24 }}>💬</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 12 }}>
            Check your texts
          </Text>
          <Text style={{ fontSize: 15, color: '#999', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            Enter the 6-digit code we sent to {fullPhone}
          </Text>

          <TextInput
            style={{
              width: '100%',
              backgroundColor: '#1a1a1a',
              borderWidth: 1,
              borderColor: '#2a2a2a',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 28,
              fontWeight: '700',
              color: '#fff',
              textAlign: 'center',
              letterSpacing: 8,
              marginBottom: 12,
            }}
            placeholder="000000"
            placeholderTextColor="#555"
            value={phoneOtp}
            onChangeText={t => setPhoneOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={verifyPhoneOtp}
          />

          <TouchableOpacity
            onPress={verifyPhoneOtp}
            disabled={phoneVerifying || phoneOtp.length !== 6}
            style={{
              width: '100%',
              backgroundColor: phoneOtp.length === 6 ? '#fff' : '#2a2a2a',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            {phoneVerifying ? (
              <ActivityIndicator color={phoneOtp.length === 6 ? '#000' : '#666'} />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: phoneOtp.length === 6 ? '#000' : '#555' }}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePhoneSignIn} disabled={phoneLoading}>
            <Text style={{ fontSize: 14, color: '#999', fontWeight: '600' }}>
              {phoneLoading ? 'Sending…' : 'Resend code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setPhoneSent(false); setPhoneOtp(''); }}
            style={{ marginTop: 16 }}
          >
            <Text style={{ fontSize: 14, color: '#999' }}>Use a different number</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Main input screen ───────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0a0a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {/* Logo */}
        <Text style={{ fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 8 }}>
          affiche
        </Text>
        <Text style={{ fontSize: 16, color: '#999', marginBottom: 48 }}>
          Toronto's social event wall
        </Text>

        <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' }}>
          Join your friends on affiche
        </Text>
        <Text style={{ fontSize: 15, color: '#999', textAlign: 'center', marginBottom: 28, lineHeight: 22 }}>
          {tab === 'email'
            ? "Enter your email and we'll send you a 6-digit code to sign in."
            : "Enter your phone number and we'll text you a 6-digit code."}
        </Text>

        {/* Tab switcher */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#1a1a1a',
          borderRadius: 12,
          padding: 4,
          width: '100%',
          marginBottom: 20,
        }}>
          {(['email', 'phone'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: 9,
                backgroundColor: tab === t ? '#fff' : 'transparent',
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '700',
                color: tab === t ? '#000' : '#666',
              }}>
                {t === 'email' ? 'Email' : 'Phone'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'email' ? (
          <>
            <TextInput
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
                marginBottom: 12,
              }}
              placeholder="your@email.com"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleEmailSignIn}
              returnKeyType="go"
            />

            <TouchableOpacity
              onPress={handleEmailSignIn}
              disabled={emailLoading || !email.trim()}
              style={{
                width: '100%',
                backgroundColor: '#fff',
                borderRadius: 14,
                paddingVertical: 17,
                alignItems: 'center',
                marginBottom: 24,
                opacity: emailLoading || !email.trim() ? 0.5 : 1,
              }}
            >
              {emailLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>Send Code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{
              flexDirection: 'row',
              width: '100%',
              marginBottom: 12,
              gap: 8,
            }}>
              <View style={{
                backgroundColor: '#1a1a1a',
                borderWidth: 1,
                borderColor: '#2a2a2a',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 14,
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 16, color: '#fff', fontWeight: '600' }}>{countryCode}</Text>
              </View>
              <TextInput
                style={{
                  flex: 1,
                  backgroundColor: '#1a1a1a',
                  borderWidth: 1,
                  borderColor: '#2a2a2a',
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: '#fff',
                }}
                placeholder="(416) 555-0100"
                placeholderTextColor="#555"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
                onSubmitEditing={handlePhoneSignIn}
                returnKeyType="go"
              />
            </View>

            <TouchableOpacity
              onPress={handlePhoneSignIn}
              disabled={phoneLoading || phone.replace(/\D/g, '').length < 10}
              style={{
                width: '100%',
                backgroundColor: '#fff',
                borderRadius: 14,
                paddingVertical: 17,
                alignItems: 'center',
                marginBottom: 24,
                opacity: phoneLoading || phone.replace(/\D/g, '').length < 10 ? 0.5 : 1,
              }}
            >
              {phoneLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>Send Code</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.replace('/(tabs)/index' as any)}>
          <Text style={{ fontSize: 13, color: '#555' }}>
            Continue without account
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
