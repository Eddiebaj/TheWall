import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../context/AppContext';

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colours, fonts, t } = useApp();
  const router = useRouter();

  const [routeLabel, setRouteLabel] = useState(id || '');

  useEffect(() => {
    if (id) setRouteLabel(id);
  }, [id]);

  // Navigate to map tab with route highlighted
  const openOnMap = () => {
    router.replace({
      pathname: '/(tabs)/map',
      params: { highlightRoute: id },
    } as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colours.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colours.bg },
          headerTintColor: colours.text,
          headerTitle: `${t('Route', 'Ligne')} ${routeLabel}`,
          headerTitleStyle: { fontWeight: '700', fontSize: fonts.lg },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" size={24} color={colours.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.content}>
        {/* Route badge */}
        <View style={[styles.routeCard, { backgroundColor: colours.surface, borderColor: colours.border }]}>
          <View style={[styles.bigBadge, { backgroundColor: colours.accent }]}>
            <Ionicons name="bus" size={28} color="#fff" style={{ marginRight: 8 }} />
            <Text style={[styles.bigRoute, { fontSize: fonts.xxl }]}>{routeLabel}</Text>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity
          onPress={openOnMap}
          style={[styles.actionBtn, { backgroundColor: colours.accent }]}
          activeOpacity={0.8}
        >
          <Ionicons name="map" size={20} color="#fff" />
          <Text style={[styles.actionText, { fontSize: fonts.md }]}>
            {t('View on Map', 'Voir sur la carte')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace({
            pathname: '/(tabs)/planner',
            params: { toLabel: `Route ${routeLabel}` },
          } as any)}
          style={[styles.actionBtn, { backgroundColor: colours.accentAlt }]}
          activeOpacity={0.8}
        >
          <Ionicons name="navigate" size={20} color="#fff" />
          <Text style={[styles.actionText, { fontSize: fonts.md }]}>
            {t('Plan a Trip', 'Planifier un trajet')}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: colours.muted, fontSize: fonts.sm }]}>
          {t(
            'Tap "View on Map" to see live bus positions for this route.',
            'Appuyez sur "Voir sur la carte" pour voir les bus en direct sur cette ligne.'
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 20, alignItems: 'center', gap: 16, paddingTop: 40 },
  routeCard: {
    borderRadius: 20, borderWidth: 1, padding: 24,
    alignItems: 'center', width: '100%', marginBottom: 8,
  },
  bigBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
  },
  bigRoute: { color: '#fff', fontWeight: '800' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
    width: '100%', justifyContent: 'center',
  },
  actionText: { color: '#fff', fontWeight: '700' },
  hint: { textAlign: 'center', marginTop: 12, lineHeight: 20 },
});
