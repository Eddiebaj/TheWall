import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ImageBackground, Pressable, Text,
  TouchableOpacity, View,
} from 'react-native';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { computeCountdown } from '../lib/useLiveCountdown';
import { toTitleCase } from '../lib/utils';
import { CampusConfig, getNextDeparture, isLibraryOpen } from '../lib/campusData';
import {
  BACKEND_URL, GAS_URL,
  SavedBoardItem, GhostReports, CATEGORY_COLOUR,
  TEAM_LOGOS, CAMPUS_LOGOS, fmtTime, fmtAbsTime, isStoStop,
} from '../lib/homeConstants';

const ScaleDecorator = ({ children }: { children: React.ReactNode }) => <>{children}</>;

// ── SavedBoardCard component ─────────────────────────────────────
export function SavedBoardCard({ item, colours, fonts, t, onPress, drag, isActive, cardShadow, garbageEvents, alerts, sensGame, onMoveLeft, onMoveRight, timeFormat, campusData }: {
  item: SavedBoardItem; colours: any; fonts: any; t: any;
  onPress: () => void; drag: () => void; isActive: boolean; cardShadow: any;
  garbageEvents: { date: string; flags: string[] }[];
  alerts: any[];
  sensGame?: { state: 'live' | 'pre' | 'none'; period?: string; homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number; startTime?: string; opponentAbbr?: string } | null;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  timeFormat?: 'relative' | 'absolute';
  campusData?: CampusConfig | null;
}) {
  const boardRouter = useRouter();
  const [preview, setPreview] = useState<{ routeId: string; headsign: string; minsAway: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewSource, setPreviewSource] = useState<'gtfs-rt' | 'gtfs-static' | 'sto-gtfs-rt' | null>(null);
  const [previewGhosts, setPreviewGhosts] = useState<GhostReports>({});
  const [previewFetchedAt, setPreviewFetchedAt] = useState(Date.now());
  const [gasPrice, setGasPrice] = useState<string | null>(null);
  const [gasFailed, setGasFailed] = useState(false);

  useEffect(() => {
    if (item.type === 'garbage' || item.type === 'service_alert' || item.type === 'external_link' || item.type === 'otrain' || item.type === 'services' || item.type === 'discover' || item.type === 'saved_team' || item.type === 'campus' || item.type === 'news' || item.type === 'neighbourhood') { setPreviewLoading(false); return; }
    if (item.type === 'gas_prices') {
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${item.id}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!cancelled) {
          setPreview((data.arrivals || []).slice(0, 3).map((a: any) => ({ routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway })));
          setPreviewFetchedAt(Date.now());
          setPreviewSource(data.source === 'sto-gtfs-rt' ? 'sto-gtfs-rt' as any : data.source === 'gtfs-rt' ? 'gtfs-rt' : 'gtfs-static');
          if (data.ghostReports) setPreviewGhosts(data.ghostReports);
        }
      } catch { if (!cancelled) setPreview([]); }
      finally { if (!cancelled) setPreviewLoading(false); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [item.type, (item as any).id]);

  const cardBase: any = [{ width: 152, height: 148, borderRadius: 14, padding: 12, backgroundColor: isActive ? colours.accent + '22' : colours.surface, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, justifyContent: 'space-between' }, cardShadow];

  if (item.type === 'garbage') {
    const next = garbageEvents[0];
    const nextDate = next ? new Date(next.date + 'T12:00:00') : null;
    const daysUntil = nextDate ? Math.round((nextDate.getTime() - new Date().setHours(0,0,0,0)) / 86400000) : null;
    const daysLabel = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : daysUntil != null ? `IN ${daysUntil}d` : '\u2014';
    const BIN_COLOURS: Record<string, string> = { garbage: '#666', 'recycling-blue': '#1a6fbf', 'recycling-black': '#222', 'green-bin': '#2d7a3a', 'yard-waste': '#8b5a00' };
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#6b7f9918', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trash" size={12} color="#6b7f99" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Garbage Day</Text>
        </View>
        {next ? (
          <>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colours.accent }}>{daysLabel}</Text>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text }}>{nextDate?.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(next.flags || []).slice(0, 4).map(flag => (
                  <View key={flag} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BIN_COLOURS[flag] || '#999' }} />
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={{ gap: 4 }}>
            <Ionicons name="location-outline" size={14} color={colours.accent} />
            <Text style={{ fontSize: 11, color: colours.muted }}>{t('Tap to set your address', 'Appuyez pour entrer votre adresse')}</Text>
          </View>
        )}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'service_alert') {
    const active = alerts.filter((a: any) => a.category !== 'accessibility');
    const hasAlerts = active.length > 0;
    const dotColor = hasAlerts ? (CATEGORY_COLOUR[active[0]?.category] || '#e8a020') : colours.accent;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#e8a02018', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="notifications" size={12} color="#e8a020" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alerts</Text>
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: hasAlerts ? dotColor : colours.accent }}>
              {hasAlerts ? `${active.length} active` : 'All clear'}
            </Text>
          </View>
          {hasAlerts && <Text style={{ fontSize: 10, color: colours.muted, lineHeight: 14 }} numberOfLines={3}>{active[0].title}</Text>}
          {!hasAlerts && <Text style={{ fontSize: 10, color: colours.muted }}>No service alerts on OC Transpo</Text>}
        </View>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to view all \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  const fetchGasPrice = useCallback(() => {
    if (gasPrice || gasFailed) return;
    fetchWithTimeout(GAS_URL, { timeout: 30000 }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => { if (d.price) setGasPrice(d.price); else setGasFailed(true); }).catch((e) => { if (__DEV__) console.warn('gas fetch failed:', e); setGasFailed(true); });
  }, [gasPrice, gasFailed]);
  if (item.type === 'gas_prices') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={() => { fetchGasPrice(); onPress(); }} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#6b7f9918', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="speedometer" size={12} color="#6b7f99" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gas Prices</Text>
        </View>
        {gasPrice ? (
          <>
            <Text style={{ fontSize: 26, fontWeight: '900', color: colours.accent }}>{gasPrice}\u00A2</Text>
            <Text style={{ fontSize: 10, color: colours.muted }}>Regular \u00B7 Ottawa avg</Text>
          </>
        ) : gasFailed ? (
          <Text style={{ fontSize: 11, color: colours.muted }}>{t('Gas prices unavailable', 'Prix d\'essence indisponible')}</Text>
        ) : (
          <Text style={{ fontSize: 11, color: colours.muted }}>{t('Tap to load prices', 'Appuyez pour charger')}</Text>
        )}
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap for nearby stations \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'otrain') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colours.lrt + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="train" size={12} color={colours.lrt} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>O-Train</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.lrt }}>Line 1 & 2</Text>
          <Text style={{ fontSize: 10, color: colours.muted }}>Confederation & Trillium Lines</Text>
        </View>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to view stations \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'services') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colours.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="grid" size={12} color={colours.accent} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Services</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>Ottawa Services</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to view all \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'discover') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#e8a02018', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="compass" size={12} color="#e8a020" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Discover</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>Discover Ottawa</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to explore \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'news') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#cc3b2a18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="newspaper" size={12} color="#cc3b2a" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>News</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }}>Local News</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to read \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'neighbourhood') {
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#7b5ea718', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="map" size={12} color="#7b5ea7" />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Area</Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text }} numberOfLines={2}>{t(item.name_en, item.name_fr)}</Text>
        <Text style={{ fontSize: 10, color: colours.accent, fontWeight: '600' }}>Tap to explore \u2192</Text>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'saved_team') {
    const teamLogo = TEAM_LOGOS[item.name];
    const isSens = item.name === 'Senators';
    const sg = isSens ? sensGame : null;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {sg?.state === 'live' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#cc3b2a' }} />
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#cc3b2a', letterSpacing: 0.5 }}>LIVE \u00B7 {sg.period}</Text>
            </View>
          )}
          {teamLogo ? (
            <Image source={teamLogo} style={{ width: sg ? 48 : 64, height: sg ? 48 : 64 }} resizeMode="contain" />
          ) : (
            <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#c8102e18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trophy" size={26} color="#c8102e" />
            </View>
          )}
        </View>
        <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text, textAlign: 'center' }} numberOfLines={1}>{item.name}</Text>
        {sg?.state === 'live' && (
          <Text style={{ fontSize: 11, fontWeight: '800', color: colours.text, textAlign: 'center', marginTop: 2 }}>{sg.homeAbbr} {sg.homeScore} \u00B7 {sg.awayAbbr} {sg.awayScore}</Text>
        )}
        {sg?.state === 'pre' && (
          <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted, textAlign: 'center', marginTop: 2 }} numberOfLines={1}>Tonight vs {sg.opponentAbbr} \u00B7 {sg.startTime}</Text>
        )}
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'external_link') {
    const label = t(item.label_en, item.label_fr);
    return (
      <ScaleDecorator>
      <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, padding: 14, backgroundColor: isActive ? item.accent + '22' : colours.surface, borderWidth: 1, borderTopWidth: 3, borderColor: isActive ? item.accent : colours.border, borderTopColor: item.accent, justifyContent: 'space-between' }, cardShadow]} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={item.icon as any} size={18} color={item.accent} />
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="open-outline" size={11} color={colours.muted} />
            <Text style={{ fontSize: 10, color: colours.muted }}>Opens externally</Text>
          </View>
        </View>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  if (item.type === 'campus') {
    const campus = campusData;
    const accent = campus?.accent || '#004890';
    const nextShuttle = campus?.shuttles?.[0] ? getNextDeparture(campus.shuttles[0].departures) : null;
    const lib = campus?.libraries?.[0] ? isLibraryOpen(campus.libraries[0]) : null;
    return (
      <ScaleDecorator>
      <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, padding: 14, backgroundColor: isActive ? accent + '22' : colours.surface, borderWidth: 1, borderTopWidth: 3, borderColor: isActive ? accent : colours.border, borderTopColor: accent, justifyContent: 'space-between' }, cardShadow]} onPress={onPress} onLongPress={drag} activeOpacity={0.85}>
        {campus && CAMPUS_LOGOS[campus.id] ? (
          <Image source={CAMPUS_LOGOS[campus.id]} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school" size={18} color={accent} />
          </View>
        )}
        <View>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colours.text, marginBottom: 2 }} numberOfLines={1}>{campus ? t(campus.name, campus.name_fr) : t('My Campus', 'Mon Campus')}</Text>
          {nextShuttle ? (
            <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }} numberOfLines={1}>
              {t('Shuttle', 'Navette')} {nextShuttle.minsAway}m
            </Text>
          ) : lib ? (
            <Text style={{ fontSize: 10, fontWeight: '600', color: lib.open ? '#00A78D' : colours.red }} numberOfLines={1}>
              {t('Library', 'Biblio')} {lib.open ? t('Open', 'Ouvert') : t('Closed', 'Ferm\u00e9')}
            </Text>
          ) : (
            <Text style={{ fontSize: 10, color: colours.muted }}>{t('Tap to set up', 'Appuyez pour configurer')}</Text>
          )}
        </View>
      </TouchableOpacity>
      </ScaleDecorator>
    );
  }

  // ── Bus Stop / LRT card ──
  const isLRT = item.type === 'lrt_station';
  const isLive = previewSource === 'gtfs-rt' || previewSource === 'sto-gtfs-rt';
  const isSTO = (item as any).agency === 'STO' || isStoStop(item.id);
  const stoBlue = '#0072bc';
  const stopRouteIds = preview.map(a => (a.routeId || '').split('-')[0]);
  const activeAlerts = alerts.filter((a: any) => a.category !== 'accessibility');
  const matchingAlertRoutes = activeAlerts.flatMap((a: any) => (a.routes || []).filter((r: string) => stopRouteIds.includes(r)));
  const alertRouteSet = [...new Set(matchingAlertRoutes)];
  return (
    <ScaleDecorator>
    <TouchableOpacity style={cardBase} onPress={onPress} onLongPress={drag} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${isLRT ? t('LRT station', 'Station du TLR') : t('Bus stop', 'Arrêt de bus')} ${toTitleCase(item.name)}`}>
      {alertRouteSet.length > 0 && (
        <View style={{ backgroundColor: '#e8a020' + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginBottom: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#e8a020' }} numberOfLines={1}>
            {'\u26A0\uFE0F'} Route {alertRouteSet.slice(0, 2).join(', ')} alert today
          </Text>
        </View>
      )}
      {(() => {
        const ghostRoutes = Object.entries(previewGhosts).filter(([, g]) => g.likelyGhost).map(([rid]) => rid);
        if (ghostRoutes.length === 0) return null;
        return (
          <View style={{ backgroundColor: '#FF9500' + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginBottom: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#FF9500' }} numberOfLines={1}>
              {'\u26A0\uFE0F'} {t(`Route ${ghostRoutes[0]} may be running ghost buses`, `Route ${ghostRoutes[0]} signal\u00e9 hors service`)}
            </Text>
          </View>
        );
      })()}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: (isLRT ? colours.lrt : isSTO ? '#0072bc' : colours.accent) + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={isLRT ? 'train' : 'bus-outline'} size={12} color={isLRT ? colours.lrt : isSTO ? '#0072bc' : colours.accent} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colours.text, flex: 1, lineHeight: 16 }} numberOfLines={2}>{toTitleCase(item.name)}</Text>
          {!previewLoading && preview.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isLive ? (isSTO ? stoBlue : '#22c55e') : colours.muted }} />
              <Text style={{ fontSize: 8, fontWeight: '700', color: isLive ? (isSTO ? stoBlue : '#22c55e') : colours.muted }}>{isLive ? 'LIVE' : 'SCHED'}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {onMoveLeft && (
            <Pressable onPress={onMoveLeft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colours.border + '80', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={12} color={colours.muted} />
            </Pressable>
          )}
          {onMoveRight && (
            <Pressable onPress={onMoveRight} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colours.border + '80', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={12} color={colours.muted} />
            </Pressable>
          )}
        </View>
      </View>
      <View style={{ gap: 3 }}>
        {previewLoading ? (
          <ActivityIndicator size="small" color={colours.accent} />
        ) : preview.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 4 }}>
            <Ionicons name="bus-outline" size={18} color={colours.muted} />
            <Text style={{ fontSize: 11, color: colours.muted, marginTop: 3 }}>{t('No arrivals scheduled', 'Aucune arriv\u00e9e pr\u00e9vue')}</Text>
          </View>
        ) : (
          preview.map((a, i) => {
            const badgeColor = isSTO ? stoBlue : colours.accent;
            return (
            <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => boardRouter.push('/(tabs)/map' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ backgroundColor: badgeColor + '18', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, minWidth: 26, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: badgeColor }}>{(a.routeId || '').split('-')[0]}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: a.minsAway <= 2 ? colours.red : badgeColor }}>
                {(() => { const cd = computeCountdown(a.minsAway, previewFetchedAt); return timeFormat === 'absolute'
                  ? fmtAbsTime(a.minsAway)
                  : t(cd.text, cd.textFr); })()}
              </Text>
              <Text style={{ fontSize: 10, color: colours.muted, flex: 1 }} numberOfLines={1}>{a.headsign || ''}</Text>
            </TouchableOpacity>
            );
          })
        )}
      </View>
    </TouchableOpacity>
    </ScaleDecorator>
  );
}

// ── SavedStopCard component ──────────────────────────────────────
export function SavedStopCard({ fav, isActive, colours, fonts, t, onPress, onLongPress, cardShadow }: any) {
  const [preview, setPreview] = useState<{ routeId: string; headsign: string; minsAway: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewSource, setPreviewSource] = useState<'gtfs-rt' | 'gtfs-static' | 'sto-gtfs-rt' | null>(null);
  const [previewFetchedAt, setPreviewFetchedAt] = useState(Date.now());
  const isSTO = isStoStop(fav.id);
  const stopColor = isSTO ? '#0072bc' : colours.accent;
  useEffect(() => {
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const resp = await fetchWithTimeout(`${BACKEND_URL}?stop=${fav.id}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!cancelled) {
          setPreview((data.arrivals || []).slice(0, 2).map((a: any) => ({ routeId: a.routeId, headsign: a.headsign, minsAway: a.minsAway })));
          setPreviewFetchedAt(Date.now());
          setPreviewSource(data.source === 'sto-gtfs-rt' ? 'sto-gtfs-rt' : data.source === 'gtfs-rt' ? 'gtfs-rt' : 'gtfs-static');
        }
      } catch { if (!cancelled) setPreview([]); }
      finally { if (!cancelled) setPreviewLoading(false); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [fav.id]);
  const isLive = previewSource === 'gtfs-rt' || previewSource === 'sto-gtfs-rt';
  const liveColor = isSTO ? '#0072bc' : '#22c55e';
  return (
    <TouchableOpacity style={[{ width: 152, height: 148, borderRadius: 14, padding: 12, backgroundColor: isActive ? stopColor : colours.surface, borderWidth: 1, borderColor: isActive ? stopColor : colours.border, justifyContent: 'space-between' }, cardShadow]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : stopColor + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bus" size={12} color={isActive ? 'white' : stopColor} />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? 'rgba(255,255,255,0.7)' : (isSTO ? '#0072bc' : colours.muted), textTransform: 'uppercase', letterSpacing: 0.5 }}>{isSTO ? 'STO' : t('Stop', 'Arr\u00eat')}</Text>
        {!previewLoading && preview.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isLive ? liveColor : (isActive ? 'rgba(255,255,255,0.5)' : colours.muted) }} />
            <Text style={{ fontSize: 8, fontWeight: '700', color: isLive ? liveColor : (isActive ? 'rgba(255,255,255,0.5)' : colours.muted) }}>{isLive ? 'LIVE' : 'SCHED'}</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '800', color: isActive ? 'white' : colours.text, lineHeight: 18 }} numberOfLines={2}>{toTitleCase(fav.name)}</Text>
      <View style={{ gap: 5 }}>
        {previewLoading ? <ActivityIndicator size="small" color={isActive ? 'rgba(255,255,255,0.6)' : stopColor} /> : preview.length === 0 ? <Text style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.5)' : colours.muted }}>{t('No arrivals', 'Aucune arriv\u00e9e')}</Text> : (
          preview.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : stopColor + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, minWidth: 28, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: isActive ? 'white' : stopColor }}>{(a.routeId || '').split('-')[0]}</Text>
              </View>
              <Text style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.7)' : colours.muted, flex: 1 }} numberOfLines={1}>{a.headsign ? `\u2192 ${a.headsign}` : ''}</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isActive ? 'white' : (a.minsAway <= 2 ? colours.red : stopColor) }}>{(() => { const cd = computeCountdown(a.minsAway, previewFetchedAt); return t(cd.text, cd.textFr); })()}</Text>
            </View>
          ))
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── SavedPlaceCard component ─────────────────────────────────────
export function SavedPlaceCard({ place, colours, fonts, language, t, onPress, onLongPress, cardShadow }: any) {
  const photoUrl = place.photoRef ? `https://routeo-backend.vercel.app/api/places?action=photo&photo_reference=${place.photoRef}&maxwidth=400` : null;
  const label = language === 'fr' ? place.categoryLabel_fr : place.categoryLabel_en;
  return (
    <TouchableOpacity style={[{ width: 160, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border }, cardShadow]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}>
      <ImageBackground source={photoUrl ? { uri: photoUrl } : undefined} style={{ width: '100%', height: 100, backgroundColor: place.categoryColor + '18', alignItems: photoUrl ? undefined : 'center', justifyContent: photoUrl ? undefined : 'center' }} resizeMode="cover">
        {!photoUrl && <Ionicons name={place.categoryIcon} size={28} color={place.categoryColor} />}
        <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: place.categoryColor, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: 'white', textTransform: 'uppercase' }}>{label}</Text>
        </View>
      </ImageBackground>
      <View style={{ padding: 10, flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text, marginBottom: 2 }} numberOfLines={1}>{place.name}</Text>
        <Text style={{ fontSize: 10, color: colours.muted }} numberOfLines={1}>{place.vicinity}</Text>
        {place.rating && (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}><Ionicons name="star" size={10} color={colours.orange} /><Text style={{ fontSize: 10, fontWeight: '600', color: colours.text }}>{place.rating}</Text></View>)}
      </View>
    </TouchableOpacity>
  );
}
