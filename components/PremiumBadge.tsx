import React from 'react';
import { Text, View } from 'react-native';

const TEAL = '#00A78D';

interface PremiumBadgeProps {
  size?: 'small' | 'large';
}

export default function PremiumBadge({ size = 'small' }: PremiumBadgeProps) {
  const isSmall = size === 'small';
  return (
    <View style={{
      backgroundColor: TEAL + '18',
      borderWidth: 1,
      borderColor: TEAL + '50',
      borderRadius: isSmall ? 6 : 10,
      paddingHorizontal: isSmall ? 6 : 10,
      paddingVertical: isSmall ? 2 : 4,
      alignSelf: 'flex-start',
    }}>
      <Text style={{
        fontSize: isSmall ? 9 : 12,
        fontWeight: '800',
        color: TEAL,
        letterSpacing: 1,
      }}>
        PRO
      </Text>
    </View>
  );
}
