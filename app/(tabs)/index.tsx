import React from 'react';
import { View, Text } from 'react-native';
import { useApp } from '../../context/AppContext';

export default function HomeScreen() {
  const { colours, t } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colours.text, textAlign: 'center' }}>
        {t('Home', 'Accueil')}
      </Text>
      <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center', marginTop: 8 }}>
        {t('Widgets have moved to the Live Map tab.', 'Les widgets ont ete deplaces vers l\'onglet Carte.')}
      </Text>
    </View>
  );
}
