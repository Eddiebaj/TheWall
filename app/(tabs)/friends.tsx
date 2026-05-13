import React from 'react';
import { View, Text } from 'react-native';
import { useApp } from '../../context/AppContext';

export default function FriendsScreen() {
  const { colours } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 32, marginBottom: 16 }}>👥</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colours.text }}>Friends</Text>
      <Text style={{ fontSize: 14, color: colours.muted, marginTop: 8 }}>Coming soon</Text>
    </View>
  );
}
