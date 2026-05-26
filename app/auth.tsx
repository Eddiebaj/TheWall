import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useAnalytics } from '../lib/analytics';

type Tab = 'email' | 'phone';
type AuthMode = 'signin' | 'signup';

export default function AuthScreen() {
  const { signInWithEmail } = useAuth();
  const router = useRouter();
  const { capture } = useAnalytics();

  const [tab, setTab] = useState<Tab>('email');

  // Email — shared
  const [email, setEmail] = useState('');

  // Email — magic link
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailVerifying, setEmailVerifying] = useState(false);

  // Email — password
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Phone state
  const [countryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // ── Email magic link handlers ───────────────────────────────────

  const handleSendLink = async () => {
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
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: 'affiche://auth/reset-password',
    });
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setResetSent(true);
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

          <TouchableOpacity onPress={handleSendLink} disabled={emailLoading}>
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {/* Logo */}
        <Text style={{ fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 8 }}>
          affiche
        </Text>
        <Text style={{ fontSize: 16, color: '#999', marginBottom: 40 }}>
          Toronto's social event wall
        </Text>

        {/* Tab switcher: Email / Phone */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#1a1a1a',
          borderRadius: 12,
          padding: 4,
          width: '100%',
          marginBottom: 28,
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
              <Text style={{ fontSize: 14, fontWeight: '700', color: tab === t ? '#000' : '#666' }}>
                {t === 'email' ? 'Email' : 'Phone'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'email' ? (
          <>
            {/* Screen heading */}
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6, alignSelf: 'flex-start' }}>
              {authMode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
            <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, alignSelf: 'flex-start' }}>
              {authMode === 'signin' ? 'Welcome back.' : 'Join your friends on affiche.'}
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
                  if (authMode === 'signup') {
                    confirmPasswordRef.current?.focus();
                  } else {
                    handlePasswordSignIn();
                  }
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

            {/* Forgot password (sign-in only) */}
            {authMode === 'signin' && (
              resetSent ? (
                <Text style={{ fontSize: 13, color: '#4ade80', alignSelf: 'flex-end', marginBottom: 20 }}>
                  Reset link sent — check your email
                </Text>
              ) : (
                <TouchableOpacity onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginBottom: 20 }}>
                  <Text style={{ fontSize: 13, color: '#888', fontWeight: '600' }}>Forgot password?</Text>
                </TouchableOpacity>
              )
            )}

            {/* Confirm password (sign-up only) */}
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

            {/* Primary action button */}
            <TouchableOpacity
              onPress={authMode === 'signin' ? handlePasswordSignIn : handlePasswordSignUp}
              disabled={passwordLoading || !passwordReady}
              style={{
                width: '100%',
                backgroundColor: '#fff',
                borderRadius: 14,
                paddingVertical: 17,
                alignItems: 'center',
                marginBottom: 16,
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

            {/* Magic link alternative */}
            <TouchableOpacity
              onPress={handleSendLink}
              disabled={emailLoading || !emailReady}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: '#2a2a2a',
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: 'center',
                marginBottom: 28,
                opacity: emailLoading || !emailReady ? 0.4 : 1,
              }}
            >
              {emailLoading ? (
                <ActivityIndicator color="#666" />
              ) : (
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#aaa' }}>
                  {authMode === 'signin' ? 'Sign in with magic link' : 'Sign up with magic link'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Switch mode */}
            {authMode === 'signin' ? (
              <TouchableOpacity
                onPress={() => {
                  setAuthMode('signup');
                  setPassword('');
                  setConfirmPassword('');
                  setResetSent(false);
                }}
              >
                <Text style={{ fontSize: 15, color: '#666', textAlign: 'center' }}>
                  Don't have an account?{'  '}
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Create account</Text>
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setAuthMode('signin');
                  setPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={{ fontSize: 15, color: '#666', textAlign: 'center' }}>
                  Already have an account?{'  '}
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Sign in</Text>
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          /* ── Phone tab ── */
          <>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6, alignSelf: 'flex-start' }}>
              Sign in with phone
            </Text>
            <Text style={{ fontSize: 15, color: '#666', marginBottom: 24, alignSelf: 'flex-start' }}>
              We'll text you a 6-digit code.
            </Text>

            <View style={{ flexDirection: 'row', width: '100%', marginBottom: 12, gap: 8 }}>
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
                returnKeyType="go"
                onSubmitEditing={handlePhoneSignIn}
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
                marginBottom: 28,
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

        <TouchableOpacity onPress={() => router.replace('/(tabs)/index' as any)} style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 13, color: '#555' }}>Continue without account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
