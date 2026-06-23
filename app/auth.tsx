import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAnalytics } from '../lib/analytics';
import { SK_ONBOARDED } from '../lib/storageKeys';

type AuthMode = 'signin' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const { capture } = useAnalytics();
  const insets = useSafeAreaInsets();

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // ── Email password handlers ─────────────────────────────────────

  const handlePasswordSignIn = async () => {
    if (!email.trim() || !password) return;
    setPasswordLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setPasswordLoading(false);
    if (error) {
      Alert.alert('Sign in failed', error.message);
    } else {
      capture('login');
      // AuthContext onAuthStateChange will handle navigation
    }
  };

  const handlePasswordSignUp = async () => {
    if (!email.trim() || !password) return;
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure both passwords are the same.');
      return;
    }
    setPasswordLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    setPasswordLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else if (data.session) {
      // Email confirmation disabled — user is signed in immediately
      capture('account_created');
      router.replace('/profile-setup' as any);
    } else {
      // Email confirmation required
      Alert.alert(
        'Check your email',
        `We sent a confirmation link to ${email.trim().toLowerCase()}. Click it to activate your account.`,
      );
    }
  };

  // ── Forgot password ─────────────────────────────────────────────

  const handleForgotPassword = async () => {
    const target = email.trim().toLowerCase();
    if (!target) {
      Alert.alert('Enter your email', 'Type your email above first.');
      return;
    }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: 'affiche://auth/reset-password',
    });
    setForgotLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setResetSent(true);
    }
  };

  // ── Main screen ─────────────────────────────────────────────────

  const emailReady = !!email.trim();
  const passwordReady = emailReady && password.length >= 1;

  const inputStyle = {
    width: '100%' as const,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0a0a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }}>
        {/* Logo */}
        <Text style={{ fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 8 }}>
          Affiche
        </Text>
        <Text style={{ fontSize: 16, color: '#999', marginBottom: 40 }}>
          Toronto's social event wall
        </Text>

        <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6, alignSelf: 'flex-start' }}>
          {authMode === 'signin' ? 'Sign in' : 'Create account'}
        </Text>
        <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, alignSelf: 'flex-start' }}>
          {authMode === 'signin' ? 'Welcome back.' : 'Join your friends on Affiche.'}
        </Text>

        {/* Email */}
        <TextInput
          style={{ ...inputStyle, marginBottom: 12 }}
          placeholder="your@email.com"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        {/* Password */}
        <View style={{ width: '100%', marginBottom: authMode === 'signin' ? 8 : 12 }}>
          <TextInput
            ref={passwordRef}
            style={{ ...inputStyle, paddingRight: 52 }}
            placeholder="Password"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType={authMode === 'signup' ? 'next' : 'go'}
            onSubmitEditing={() => {
              if (authMode === 'signup') confirmPasswordRef.current?.focus();
              else handlePasswordSignIn();
            }}
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

        {authMode === 'signin' && (
          resetSent ? (
            <Text style={{ fontSize: 13, color: '#4ade80', alignSelf: 'flex-end', marginBottom: 20 }}>
              Reset link sent — check your email
            </Text>
          ) : (
            <TouchableOpacity onPress={handleForgotPassword} disabled={forgotLoading} style={{ alignSelf: 'flex-end', marginBottom: 20, opacity: forgotLoading ? 0.5 : 1 }}>
              <Text style={{ fontSize: 13, color: '#888', fontWeight: '600' }}>{forgotLoading ? 'Sending…' : 'Forgot password?'}</Text>
            </TouchableOpacity>
          )
        )}

        {authMode === 'signup' && (
          <View style={{ width: '100%', marginBottom: 20 }}>
            <TextInput
              ref={confirmPasswordRef}
              style={{ ...inputStyle, paddingRight: 52 }}
              placeholder="Confirm password"
              placeholderTextColor="#555"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handlePasswordSignUp}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(v => !v)}
              style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 13, color: '#666', fontWeight: '600' }}>
                {showConfirmPassword ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Primary CTA */}
        <TouchableOpacity
          onPress={authMode === 'signin' ? handlePasswordSignIn : handlePasswordSignUp}
          disabled={passwordLoading || !passwordReady}
          style={{
            width: '100%', backgroundColor: '#fff', borderRadius: 14,
            paddingVertical: 17, alignItems: 'center', marginBottom: 16,
            opacity: passwordLoading || !passwordReady ? 0.5 : 1,
          }}
        >
          {passwordLoading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginBottom: 28 }}>
          {authMode === 'signin' ? (
            <TouchableOpacity onPress={() => { setAuthMode('signup'); setPassword(''); setConfirmPassword(''); setResetSent(false); }}>
              <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }}>Create account</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => { setAuthMode('signin'); setPassword(''); setConfirmPassword(''); }}>
              <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }}>Sign in</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={async () => {
            const onboarded = await AsyncStorage.getItem(SK_ONBOARDED).catch(() => null);
            if (!onboarded) {
              router.replace('/onboarding');
            } else {
              router.replace('/(tabs)/index' as any);
            }
          }}
          style={{ marginTop: 24 }}
        >
          <Text style={{ fontSize: 13, color: '#555' }}>Continue without account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
