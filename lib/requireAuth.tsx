/**
 * useRequireAuth  -  gate any action behind authentication.
 *
 * Usage:
 *   const { requireAuth, authModal } = useRequireAuth();
 *   // In JSX render {authModal}
 *   // Before any auth-gated action:
 *   if (!requireAuth()) return;
 */
import React, { useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

export function useRequireAuth() {
  const { user } = useAuth();
  const { colours } = useApp();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  function requireAuth(): boolean {
    if (user) return true;
    setVisible(true);
    return false;
  }

  const authModal = (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
      }}>
        <View style={{
          backgroundColor: colours.surface,
          borderRadius: 20,
          padding: 28,
          width: '100%',
          maxWidth: 340,
        }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text, marginBottom: 8 }}>
            Sign in to continue
          </Text>
          <Text style={{ fontSize: 14, color: colours.muted, marginBottom: 24, lineHeight: 20 }}>
            Create a free account to RSVP, connect with friends, and plan your night out.
          </Text>

          <TouchableOpacity
            onPress={() => { setVisible(false); router.push('/auth' as any); }}
            style={{
              backgroundColor: colours.accent,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 10,
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Sign In / Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setVisible(false)}
            style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            activeOpacity={0.7}
          >
            <Text style={{ color: colours.muted, fontSize: 14, fontWeight: '600' }}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return { requireAuth, authModal };
}
