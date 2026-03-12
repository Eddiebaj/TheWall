import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

// ── Constants ────────────────────────────────────────────────────
const ALERTS_URL = 'https://routeo-backend.vercel.app/api/alerts';
const LRT_URL = 'https://routeo-backend.vercel.app/api/alerts?action=lrt';

const CATEGORY_COLOUR: { [key: string]: string } = {
  lrt: '#00A78D', detour: '#e8a020', cancellation: '#cc3b2a',
  delay: '#e8a020', accessibility: '#7b5ea7', general: '#004890',
};

const LINE_COLOURS = { line1: '#004890', line2: '#00A78D', line4: '#8E44AD' };

// ── Types ─────────────────────────────────────────────────────────
type ServiceAlert = {
  id: number; title: string; description: string;
  link: string; pubDate: string; routes: string[]; category: string;
};

type LrtStation = { code: string; name: string; ok: boolean };
type LrtLine = { status: 'running' | 'disrupted'; stations: LrtStation[] };
type LrtIncident = { hoursAgo: number; description: string; affectedStations: string[] };
type LrtData = {
  line1: LrtLine; line2: LrtLine; line4: LrtLine;
  incidents: LrtIncident[]; fetchedAt: string;
};

// ── Main Screen ───────────────────────────────────────────────────
export default function AlertsScreen() {
  const { colours, fonts, t, theme } = useApp();

  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [lrt, setLrt] = useState<LrtData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const lrtInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLight = theme === 'light' || (theme === 'system' && colours.bg === '#f0f4f8');
  const cardShadow = isLight
    ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }
    : {};

  const fetchAlerts = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [alertResp, lrtResp] = await Promise.all([
        fetchWithTimeout(ALERTS_URL),
        fetchWithTimeout(LRT_URL),
      ]);
      if (alertResp.ok) {
        const data = await alertResp.json();
        setAlerts(data.alerts || []);
      }
      if (lrtResp.ok) {
        setLrt(await lrtResp.json());
      }
      const now = new Date();
      setLastUpdated(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch on focus
  useFocusEffect(useCallback(() => { fetchAlerts(); }, []));

  // Auto-refresh LRT every 5 minutes
  useEffect(() => {
    lrtInterval.current = setInterval(() => {
      fetchWithTimeout(LRT_URL).then(r => r.ok ? r.json() : null).then(d => { if (d) setLrt(d); }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => { if (lrtInterval.current) clearInterval(lrtInterval.current); };
  }, []);

  // ── Derived data ──────────────────────────────────────────────
  const activeAlerts = alerts.filter(a => a.category !== 'accessibility');
  const accessibilityAlerts = alerts.filter(a => a.category === 'accessibility');
  const categories = [...new Set(alerts.map(a => a.category))].filter(Boolean);
  const filtered = activeFilter ? alerts.filter(a => a.category === activeFilter) : alerts;
  const criticalCount = alerts.filter(a => a.category === 'cancellation' || a.category === 'lrt').length;
  const hasAlerts = activeAlerts.length > 0;
  const statusColor = !hasAlerts ? '#34c759' : CATEGORY_COLOUR[activeAlerts[0]?.category] || '#e8a020';

  // ── Station pill component ─────────────────────────────────────
  const StationPill = ({ station, lineColor }: { station: LrtStation; lineColor: string }) => (
    <View style={{
      paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6,
      backgroundColor: station.ok ? lineColor + '20' : '#cc3b2a20',
      borderWidth: 1,
      borderColor: station.ok ? lineColor + '40' : '#cc3b2a60',
      minWidth: 36, alignItems: 'center',
    }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color: station.ok ? lineColor : '#cc3b2a' }}>
        {station.code}
      </Text>
    </View>
  );

  // ── LRT line row ───────────────────────────────────────────────
  const LineRow = ({ label, line, color }: { label: string; line: LrtLine; color: string }) => {
    const disrupted = line.status === 'disrupted';
    return (
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: disrupted ? '#cc3b2a' : '#34c759' }} />
          <Text style={{ fontSize: fonts.sm, fontWeight: '800', color: colours.text }}>{label}</Text>
          <Text style={{ fontSize: 10, color: disrupted ? '#cc3b2a' : '#34c759', fontWeight: '700' }}>
            {disrupted ? t('DISRUPTED', 'PERTURBE') : t('RUNNING', 'EN SERVICE')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {line.stations.map((s, i) => (
            <StationPill key={`${label}_${i}`} station={s} lineColor={color} />
          ))}
        </View>
      </View>
    );
  };

  // ── Render alert card ──────────────────────────────────────────
  const renderAlertCard = (alert: ServiceAlert) => {
    const catColour = CATEGORY_COLOUR[alert.category] || colours.accent;
    const isExpanded = expandedId === alert.id;
    return (
      <TouchableOpacity
        key={alert.id}
        onPress={() => setExpandedId(isExpanded ? null : alert.id)}
        activeOpacity={0.85}
        style={[styles.alertCard, {
          backgroundColor: colours.surface, borderColor: colours.border, borderLeftColor: catColour,
        }, cardShadow]}
      >
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
        <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text, marginTop: 8, lineHeight: 20 }}>
          {alert.title}
        </Text>
        {isExpanded && alert.description ? (
          <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 6, lineHeight: 18 }}>
            {alert.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          {alert.pubDate ? (
            <Text style={{ fontSize: 10, color: colours.muted }}>{alert.pubDate}</Text>
          ) : <View />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {alert.description ? (
              <Text style={{ fontSize: 11, color: colours.accent, fontWeight: '600' }}>
                {isExpanded ? t('Less', 'Moins') + ' \u25B2' : t('Details', 'Details') + ' \u25BC'}
              </Text>
            ) : null}
            {alert.link ? (
              <TouchableOpacity onPress={() => Linking.openURL(alert.link)}>
                <Text style={{ fontSize: 11, color: colours.accent, fontWeight: '600' }}>OC Transpo \u2197</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchAlerts(true)} tintColor={colours.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: fonts.xxl, fontWeight: '800', color: colours.text, letterSpacing: -0.5 }}>
              {t('Alerts', 'Alertes')}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
              {lastUpdated ? t(`Updated ${lastUpdated} · Pull to refresh`, `Mis a jour ${lastUpdated} · Tirer pour rafraichir`) : t('OC Transpo · Live', 'OC Transpo · En direct')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => fetchAlerts(true)}
            style={[styles.refreshBtn, { backgroundColor: colours.surface, borderColor: colours.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('Refresh alerts', 'Rafraichir les alertes')}
          >
            <Ionicons name="refresh" size={16} color={colours.accent} />
          </TouchableOpacity>
        </View>

        {/* Status banner */}
        <View style={[styles.statusBanner, {
          backgroundColor: statusColor + '12', borderColor: statusColor + '40',
          marginHorizontal: 20, marginBottom: 16,
        }, cardShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: statusColor + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={hasAlerts ? 'warning' : 'checkmark-circle'} size={20} color={statusColor} />
            </View>
            <View>
              <Text style={{ fontSize: fonts.md, fontWeight: '800', color: statusColor }}>
                {!hasAlerts
                  ? t('All Systems Normal', 'Tous les systemes normaux')
                  : criticalCount > 0
                    ? `${criticalCount} ${t(criticalCount > 1 ? 'Critical Alerts' : 'Critical Alert', criticalCount > 1 ? 'alertes critiques' : 'alerte critique')}`
                    : `${activeAlerts.length} ${t(activeAlerts.length > 1 ? 'Active Alerts' : 'Active Alert', activeAlerts.length > 1 ? 'alertes actives' : 'alerte active')}`
                }
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 1 }}>
                {!hasAlerts
                  ? t('No active disruptions on OC Transpo', 'Aucune perturbation active sur OC Transpo')
                  : `${accessibilityAlerts.length > 0 ? `${accessibilityAlerts.length} ${t('accessibility notices', 'avis d\'accessibilite')}` : ''}`
                }
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://occasionaltransport.ca')}
            style={[styles.lrtCommunityBtn, { backgroundColor: colours.bg, borderColor: colours.border }]}
            accessibilityRole="link"
            accessibilityLabel={t('View LRT status on OccasionalTransport', 'Voir le statut du TLR sur OccasionalTransport')}
          >
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#00A78D', textAlign: 'center' }}>{t('LRT', 'TLR')}{'\n'}{t('STATUS', 'STATUT')}</Text>
          </TouchableOpacity>
        </View>

        {/* LRT Station Status */}
        {lrt && (
          <View style={[styles.lrtSection, {
            backgroundColor: colours.surface, borderColor: colours.border,
            marginHorizontal: 20, marginBottom: 16,
          }, cardShadow]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="train-outline" size={18} color={colours.accent} />
              <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text }}>
                {t('O-Train Station Status', 'Statut des stations O-Train')}
              </Text>
            </View>

            <LineRow label={t('Line 1 Confederation', 'Ligne 1 Confederation')} line={lrt.line1} color={LINE_COLOURS.line1} />
            <LineRow label={t('Line 2 Trillium', 'Ligne 2 Trillium')} line={lrt.line2} color={LINE_COLOURS.line2} />
            <LineRow label={t('Line 4 Airport', 'Ligne 4 Aeroport')} line={lrt.line4} color={LINE_COLOURS.line4} />

            {/* Recent incidents */}
            {lrt.incidents.length > 0 && (
              <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colours.border, paddingTop: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colours.muted, letterSpacing: 1, marginBottom: 8 }}>
                  {t('RECENT INCIDENTS', 'INCIDENTS RECENTS')}
                </Text>
                {lrt.incidents.map((inc, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, minWidth: 36, textAlign: 'right' }}>
                      {inc.hoursAgo < 1 ? '<1h' : `${Math.round(inc.hoursAgo)}h`}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fonts.sm, color: colours.text, lineHeight: 18 }}>{inc.description}</Text>
                      {inc.affectedStations.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                          {inc.affectedStations.map((s, j) => (
                            <View key={j} style={{ backgroundColor: '#cc3b2a18', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 8, fontWeight: '700', color: '#cc3b2a' }}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Link to full site */}
            <TouchableOpacity
              onPress={() => Linking.openURL('https://occasionaltransport.ca')}
              style={{ marginTop: 8, alignItems: 'center', paddingVertical: 8 }}
              accessibilityRole="link"
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>
                {t('View full status on OccasionalTransport.ca', 'Voir le statut complet sur OccasionalTransport.ca')} {'\u2197'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? 'white' : colours.text, textTransform: 'capitalize' }}>
                    {cat === 'all' ? t('All', 'Tous') : cat}
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
                {t('Loading alerts...', 'Chargement des alertes...')}
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={[styles.centerState, {
              backgroundColor: colours.surface, borderRadius: 16,
              borderWidth: 1, borderColor: colours.border, paddingVertical: 40,
            }, cardShadow]}>
              <Ionicons name="checkmark-circle" size={48} color="#34c759" />
              <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, marginTop: 12 }}>
                {t('All Clear', 'Tout est normal')}
              </Text>
              <Text style={{ fontSize: fonts.sm, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                {activeFilter
                  ? t(`No ${activeFilter} alerts right now.`, `Aucune alerte ${activeFilter} en ce moment.`)
                  : t('No active service alerts on OC Transpo.', 'Aucune alerte de service active sur OC Transpo.')
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 16, borderWidth: 1, gap: 10,
  },
  lrtCommunityBtn: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  lrtSection: {
    padding: 16, borderRadius: 16, borderWidth: 1,
  },
  filterPill: {
    paddingHorizontal: 14, height: 32,
    borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  alertCard: {
    padding: 14, borderRadius: 14,
    borderWidth: 1, borderLeftWidth: 4, marginBottom: 10,
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
