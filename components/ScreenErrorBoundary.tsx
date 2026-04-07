import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
  colours: { bg: string; text: string; muted: string; accent: string; [key: string]: string };
  fonts: { sm: number; md: number; lg: number; xl: number; xxl: number };
}

interface State {
  hasError: boolean;
}

export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) console.warn('ScreenErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      const { colours, fonts } = this.props;
      return (
        <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="warning-outline" size={48} color="#F59E0B" />
          <Text style={{ fontSize: 18, fontWeight: '700', color: colours.text, textAlign: 'center', marginTop: 16, marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginBottom: 24 }}>
            Une erreur est survenue
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{
              backgroundColor: colours.accent,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: fonts.md, fontWeight: '600', color: '#fff' }}>
              Try again / R{'\u00E9'}essayer
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
