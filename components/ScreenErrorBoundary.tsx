import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

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
          <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginBottom: 16 }}>
            Something went wrong{'\n'}Une erreur est survenue
          </Text>
          <TouchableOpacity onPress={() => this.setState({ hasError: false })}>
            <Text style={{ fontSize: fonts.sm, color: colours.accent }}>Try again / R&#xE9;essayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
