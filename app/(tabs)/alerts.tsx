import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Linking, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../context/AppContext';

// ── Constants ────────────────────────────────────────────────────
const ALERTS_URL = 'https://routeo-backend.vercel.app/api/alerts';

const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#7b5ea7', general: '#004890',
};

// ── Types ─────────────────────────────────────────────────────────
type ServiceAlert = {
  id: number; title: string; description: string;
  link: string; pubDate: string; routes: string[]; category: string;
};

// ── Main Screen ───────────────────────────────────────────────────
export default function AlertsScreen() {
  const { colours, fonts, t, theme } = useApp();

  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const isLight = theme === 'light' || (theme === 'system' && colours.bg === '#f0f4f8');
  const cardShadow = isLight
    ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }
    : {};

  // Refresh alerts every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      fetchAlerts();
    }, [])
  );

  const fetchAlerts = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const resp = await fetch(ALERTS_URL);
      const data = await resp.json();
      setAlerts(data.alerts || []);
      const now = new Date();
      setLastUpdated(
        `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      );
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────
  const activeAlerts = alerts.filter(a => a.category !== 'accessibility');
  const accessibilityAlerts = alerts.filter(a => a.category === 'accessibility');
  const categories = [...new Set(alerts.map(a => a.category))].filter(Boolean);

  const filtered = activeFilter
    ? alerts.filter(a => a.category === activeFilter)
    : alerts;

  const criticalCount = alerts.filter(
    a => a.category === 'cancellation' || a.category === 'lrt'
  ).length;
  const hasAlerts = activeAlerts.length > 0;

  // ── Status banner colour ──────────────────────────────────────
  const statusColor = !hasAlerts
    ? '#34c759'
    : CATEGORY_COLOUR[activeAlerts[0]?.category] || '#e8a020';

  // ── Render an individual alert card ──────────────────────────
  const renderAlertCard = (alert: ServiceAlert) => {
    const catColour = CATEGORY_COLOUR[alert.category] || colours.accent;
    const isExpanded = expandedId === alert.id;

    return (
      <TouchableOpacity
        key={alert.id}
        onPress={() => setExpandedId(isExpanded ? null : alert.id)}
        activeOpacity={0.85}
        style={[styles.alertCard, {
          backgroundColor: colours.surface,
          borderColor: colours.border,
          borderLeftColor: catColour,
        }, cardShadow]}
      >
        {/* Category + route badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={[styles.catBadge, { backgroundColor: catColour + '20' }]}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: catColour, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {alert.category}
            </Text>
          </View>
          {alert.routes.slice(0, 5).map(r => (
            <View key={r} style={[styles.routeBadge, { backgroundColor: colours.accent + '18' }]}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colours.accent }}>{r}</Text>
            </View>
          ))}
          {alert.routes.length > 5 && (
            <Text style={{ fontSize: 10, color: colours.muted }}>+{alert.routes.length - 5}</Text>
          )}
        </View>

        {/* Title */}
        <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 8, lineHeight: 20 }}>
          {alert.title}
        </Text>

        {/* Expanded description */}
        {isExpanded && alert.description ? (
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 6, lineHeight: 18 }}>
            {alert.description}
          </Text>
        ) : null}

        {/* Footer */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          {alert.pubDate ? (
            <Text style={{ fontSize: 10, color: colours.muted }}>{alert.pubDate}</Text>
          ) : <View />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {alert.description ? (
              <Text style={{ fontSize: 11, color: colours.accent, fontWeight: '600' }}>
                {isExpanded ? 'Less ▲' : 'Details ▼'}
              </Text>
            ) : null}
            {alert.link ? (
              <TouchableOpacity onPress={() => Linking.openURL(alert.link)}>
                <Text style={{ fontSize: 11, color: colours.accent, fontWeight: '600' }}>
                  OC Transpo ↗
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colours.bg }]}>
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAlerts(true)}
            tintColor={colours.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -0.5 }}>
              Alerts
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
              {lastUpdated ? `Updated ${lastUpdated} · Pull to refresh` : 'OC Transpo · Live'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => fetchAlerts(true)}
            style={[styles.refreshBtn, { backgroundColor: colours.surface, borderColor: colours.border }]}
          >
            <Ionicons name="refresh" size={16} color={colours.accent} />
          </TouchableOpacity>
        </View>

        {/* Status banner */}
        <View style={[styles.statusBanner, {
          backgroundColor: statusColor + '12',
          borderColor: statusColor + '40',
          marginHorizontal: 20,
          marginBottom: 16,
        }, cardShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: statusColor + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons
                name={hasAlerts ? 'warning' : 'checkmark-circle'}
                size={20}
                color={statusColor}
              />
            </View>
            <View>
              <Text style={{ fontSize: fonts.md, fontWeight: '800', color: statusColor }}>
                {!hasAlerts
                  ? 'All Systems Normal'
                  : criticalCount > 0
                    ? `${criticalCount} Critical Alert${criticalCount > 1 ? 's' : ''}`
                    : `${activeAlerts.length} Active Alert${activeAlerts.length > 1 ? 's' : ''}`
                }
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
                {!hasAlerts
                  ? 'No active disruptions on OC Transpo'
                  : `${accessibilityAlerts.length > 0 ? ` · ${accessibilityAlerts.length} accessibility notice${accessibilityAlerts.length > 1 ? 's' : ''}` : ''}`
                }
              </Text>
            </View>
          </View>
          {/* LRT community status link */}
          <TouchableOpacity
            onPress={() => Linking.openURL('https://occasionaltransport.ca')}
            style={[styles.lrtCommunityBtn, { backgroundColor: colours.bg, borderColor: colours.border }]}
          >
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#00A78D', textAlign: 'center' }}>LRT{'\n'}STATUS</Text>
          </TouchableOpacity>
        </View>

        {/* Category filter pills */}
        {categories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 4 }}
            style={{ marginBottom: 12, flexGrow: 0, height: 40 }}
          >
            {(['all', ...categories] as string[]).map(cat => {
              const active = cat === 'all' ? activeFilter === null : activeFilter === cat;
              const colour = cat === 'all' ? colours.accent : (CATEGORY_COLOUR[cat] || colours.accent);
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setActiveFilter(cat === 'all' ? null : (active ? null : cat))}
                  style={[styles.filterPill, {
                    backgroundColor: active ? colour : colours.surface,
                    borderColor: active ? colour : colours.border,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? 'white' : colours.text, textTransform: 'capitalize' }}>
                    {cat === 'all' ? 'All' : cat}
                    {cat !== 'all' && ` (${alerts.filter(a => a.category === cat).length})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Alerts list */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colours.accent} size="large" />
              <Text style={{ color: colours.muted, marginTop: 12, fontSize: fonts.sm }}>
                Loading alerts...
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={[styles.centerState, {
              backgroundColor: colours.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colours.border,
              paddingVertical: 40,
            }, cardShadow]}>
              <Ionicons name="checkmark-circle" size={48} color="#34c759" />
              <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginTop: 12 }}>
                All Clear
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                {activeFilter
                  ? `No ${activeFilter} alerts right now.`
                  : 'No active service alerts on OC Transpo.'
                }
              </Text>
            </View>
          ) : (
            filtered.map(renderAlertCard)
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  lrtCommunityBtn: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  filterPill: {
    paddingHorizontal: 14, height: 32,
    borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  alertCard: {
    padding: 14, borderRadius: 14,
    borderWidth: 1, borderLeftWidth: 4,
    marginBottom: 10,
  },
  catBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  routeBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  centerState: {
    alignItems: 'center', paddingVertical: 32,
  },
});
