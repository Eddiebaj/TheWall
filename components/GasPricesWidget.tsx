import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, Modal, ScrollView, Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';
import { SK_GAS_VOTED_IDS } from '../lib/storageKeys';
import { GAS_URL, GasReport, timeAgo } from '../lib/homeConstants';

// ── GasPricesExpanded ────────────────────────────────────────────
export function GasPricesExpanded({ colours, fonts }: { colours: any; fonts: any }) {
  const [stations, setStations] = useState<{ name: string; price: string; address: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgPrice, setAvgPrice] = useState<string | null>(null);

  useEffect(() => {
    fetchWithTimeout(GAS_URL)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (d.price) setAvgPrice(d.price);
        if (d.stations) setStations(d.stations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colours.accent} size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
      {avgPrice && (
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: colours.accent + '12', borderWidth: 1, borderColor: colours.accent + '30', marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="speedometer" size={24} color={colours.accent} />
          <View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: colours.accent }}>{avgPrice}¢/L</Text>
            <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Ottawa average · Regular unleaded</Text>
          </View>
        </View>
      )}
      {stations.length > 0 ? (
        stations.map((s, i) => (
          <View key={i} style={{ padding: 14, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{s.name}</Text>
              {s.address ? <Text style={{ fontSize: 11, color: colours.muted, marginTop: 2 }} numberOfLines={1}>{s.address}</Text> : null}
            </View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colours.accent, marginLeft: 12 }}>{s.price}¢</Text>
          </View>
        ))
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ color: colours.muted, fontSize: 13, textAlign: 'center' }}>Station-level data not available.{'\n'}Check GasBuddy for full listings.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── GasPricesWidget ──────────────────────────────────────────────
export function GasPricesWidget({ colours, fonts, t, cardShadow, isBoardSaved, toggleBoard }: { colours: any; fonts: any; t: (en: string, fr: string) => string; cardShadow: any; isBoardSaved: boolean; toggleBoard: () => void }) {
  const [reports, setReports] = useState<GasReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportModal, setReportModal] = useState(false);
  const [stationQuery, setStationQuery] = useState('');
  const [stationName, setStationName] = useState('');
  const [stationAddress, setStationAddress] = useState('');
  const [stationLat, setStationLat] = useState<number | null>(null);
  const [stationLng, setStationLng] = useState<number | null>(null);
  const [stationResults, setStationResults] = useState<{ label: string; lat?: number; lng?: number }[]>([]);
  const stationSeq = useRef(0);
  const [price, setPrice] = useState('');
  const [fuelType, setFuelType] = useState<'regular' | 'premium' | 'diesel'>('regular');
  const [submitting, setSubmitting] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(SK_GAS_VOTED_IDS).then(val => {
      if (val) try { setVotedIds(new Set(JSON.parse(val))); } catch {}
    }).catch(() => {});
  }, []);

  const [prevPrices, setPrevPrices] = useState<{ [station: string]: number }>({});

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('gas_prices')
      .select('*')
      .order('reported_at', { ascending: false })
      .limit(3);
    setReports(data || []);
    if (data && data.length > 0) {
      const stationNames = [...new Set(data.map((r: GasReport) => r.station_name))];
      const prev: { [station: string]: number } = {};
      for (const name of stationNames) {
        const { data: older } = await supabase
          .from('gas_prices')
          .select('price_per_litre')
          .eq('station_name', name)
          .order('reported_at', { ascending: false })
          .range(1, 1);
        if (older && older.length > 0) prev[name] = older[0].price_per_litre;
      }
      setPrevPrices(prev);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const handleStationSearch = (text: string) => {
    setStationQuery(text);
    setStationName(''); setStationAddress(''); setStationLat(null); setStationLng(null);
    if (text.length < 2) { setStationResults([]); return; }
    const seq = ++stationSeq.current;
    fetchWithTimeout(`https://routeo-backend.vercel.app/api/places?action=autocomplete-geocode&input=${encodeURIComponent(text)}`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { if (seq === stationSeq.current) setStationResults((d.results || []).filter((r: any) => r.label).slice(0, 4)); })
      .catch(() => { if (seq === stationSeq.current) setStationResults([]); });
  };

  const selectStation = (result: { label: string; lat?: number; lng?: number }) => {
    const parts = result.label.split(',');
    const name = parts[0].trim();
    const addr = parts.length > 1 ? result.label : '';
    setStationQuery(name);
    setStationName(name);
    setStationAddress(addr);
    setStationLat(result.lat || null);
    setStationLng(result.lng || null);
    setStationResults([]);
  };

  const handleSubmit = async () => {
    const priceNum = parseFloat(price);
    if (!stationName.trim() || isNaN(priceNum) || priceNum <= 0) {
      Alert.alert(t('Missing info', 'Info manquante'), t('Select a station and enter a valid price.', 'S\u00e9lectionnez une station et entrez un prix valide.'));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('gas_prices').insert({
      station_name: stationName.trim(),
      address: stationAddress || null,
      lat: stationLat,
      lng: stationLng,
      price_per_litre: priceNum,
      fuel_type: fuelType,
    });
    if (error) {
      setSubmitting(false);
      Alert.alert(t('Error', 'Erreur'), t('Failed to submit price. Try again.', 'Impossible de soumettre le prix. Reessayez.'));
      return;
    }
    setStationQuery(''); setStationName(''); setStationAddress(''); setStationLat(null); setStationLng(null);
    setPrice(''); setFuelType('regular');
    setSubmitting(false); setReportModal(false);
    fetchReports();
  };

  const handleVote = async (id: string, type: 'confirm' | 'dispute') => {
    if (votedIds.has(id)) return;
    const col = type === 'confirm' ? 'confirmed_count' : 'disputed_count';
    const report = reports.find(r => r.id === id);
    if (!report) return;
    setVotedIds(prev => new Set(prev).add(id));
    setReports(prev => prev.map(r => r.id === id ? { ...r, [col]: (r[col] || 0) + 1 } : r));
    const { error } = await supabase.from('gas_prices').update({ [col]: (report[col] || 0) + 1 }).eq('id', id);
    if (error) {
      setVotedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setReports(prev => prev.map(r => r.id === id ? { ...r, [col]: report[col] || 0 } : r));
      Alert.alert(t('Error', 'Erreur'), t('Failed to save \u2014 please try again.', '\u00c9chec de la sauvegarde \u2014 veuillez r\u00e9essayer.'));
      return;
    }
    AsyncStorage.setItem(SK_GAS_VOTED_IDS, JSON.stringify([...votedIds, id])).catch(() => {});
  };

  const FUEL_TYPES: { key: 'regular' | 'premium' | 'diesel'; label: string }[] = [
    { key: 'regular', label: 'Regular' },
    { key: 'premium', label: 'Premium' },
    { key: 'diesel', label: 'Diesel' },
  ];

  return (
    <>
      <View style={[{ marginHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, overflow: 'hidden', marginBottom: 16 }, cardShadow]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colours.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#00A78D18', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="speedometer" size={16} color="#00A78D" />
            </View>
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.muted, letterSpacing: 1 }}>{t('Gas Prices', 'Prix essence')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={toggleBoard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={isBoardSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isBoardSaved ? colours.accent : colours.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setReportModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#00A78D' + '15', borderWidth: 1, borderColor: '#00A78D' }}
            >
              <Ionicons name="add-circle" size={14} color="#00A78D" />
              <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: '#00A78D' }}>{t('Report', 'Signaler')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <ActivityIndicator color={colours.accent} />
          </View>
        ) : reports.length === 0 ? (
          <View style={{ padding: 28, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#00A78D' + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="speedometer-outline" size={28} color="#00A78D" />
            </View>
            <Text style={{ fontSize: fonts.lg, fontWeight: '800', color: colours.text, textAlign: 'center' }}>
              {t('No reports yet', 'Aucun signalement')}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
              {t('Help Ottawa drivers by reporting the gas price at your nearest station.', 'Aidez les automobilistes d\u2019Ottawa en signalant le prix de l\u2019essence.')}
            </Text>
            <TouchableOpacity
              onPress={() => setReportModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#00A78D' }}
            >
              <Ionicons name="add-circle" size={16} color="white" />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.md }}>{t('Report a Price', 'Signaler un prix')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          reports.map((r, i) => {
            const voted = votedIds.has(r.id);
            return (
              <View key={r.id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colours.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.md, fontWeight: '700', color: colours.text }} numberOfLines={1}>{r.station_name}</Text>
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
                      {r.fuel_type.charAt(0).toUpperCase() + r.fuel_type.slice(1)} · {timeAgo(r.reported_at)}
                    </Text>
                    {prevPrices[r.station_name] != null && prevPrices[r.station_name] !== r.price_per_litre && (() => {
                      const diff = (r.price_per_litre - prevPrices[r.station_name]) * 100;
                      const up = diff > 0;
                      return (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: up ? '#cc3b2a' : '#2d7a3a', marginTop: 2 }}>
                          {up ? '\u2191' : '\u2193'} {Math.abs(diff).toFixed(1)}\u00A2 since last report
                        </Text>
                      );
                    })()}
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#00A78D' }}>
                    {(r.price_per_litre * 100).toFixed(1)}¢
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => handleVote(r.id, 'confirm')}
                    disabled={voted}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, opacity: voted ? 0.5 : 1 }}
                  >
                    <Ionicons name="thumbs-up-outline" size={14} color="#34c759" />
                    <Text style={{ fontSize: 12, color: '#34c759', fontWeight: '600' }}>{r.confirmed_count}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleVote(r.id, 'dispute')}
                    disabled={voted}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, opacity: voted ? 0.5 : 1 }}
                  >
                    <Ionicons name="thumbs-down-outline" size={14} color="#cc3b2a" />
                    <Text style={{ fontSize: 12, color: '#cc3b2a', fontWeight: '600' }}>{r.disputed_count}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      <Modal visible={reportModal} animationType="slide" transparent onRequestClose={() => setReportModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, marginTop: 12, marginBottom: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{t('Report Gas Price', 'Signaler un prix')}</Text>
                <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.surface, alignItems: 'center', justifyContent: 'center' }} onPress={() => setReportModal(false)} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
                  <Ionicons name="close" size={18} color={colours.text} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 20, gap: 14 }}>
                <View style={{ zIndex: 10 }}>
                  <TextInput
                    placeholder={t('Search gas station...', 'Chercher une station...')}
                    placeholderTextColor={colours.muted}
                    value={stationQuery}
                    onChangeText={handleStationSearch}
                    style={{ borderWidth: 1, borderColor: stationName ? '#00A78D' : colours.border, borderRadius: 12, padding: 14, fontSize: fonts.md, color: colours.text, backgroundColor: colours.surface }}
                    accessibilityLabel={t('Search gas station', 'Chercher une station')}
                  />
                  {stationName ? (
                    <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 4, marginLeft: 4 }} numberOfLines={1}>{stationAddress}</Text>
                  ) : null}
                  {stationResults.length > 0 && (
                    <View style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 12, marginTop: 6, overflow: 'hidden', backgroundColor: colours.surface }}>
                      {stationResults.map((r, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => selectStation(r)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < stationResults.length - 1 ? 1 : 0, borderBottomColor: colours.border }}
                        >
                          <Ionicons name="location-outline" size={16} color={colours.muted} />
                          <Text style={{ flex: 1, fontSize: fonts.md, color: colours.text }} numberOfLines={1}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <TextInput
                  placeholder={t('Price per litre (e.g. 1.689)', 'Prix par litre (ex. 1.689)')}
                  placeholderTextColor={colours.muted}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: colours.border, borderRadius: 12, padding: 14, fontSize: fonts.md, color: colours.text, backgroundColor: colours.surface }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {FUEL_TYPES.map(ft => (
                    <TouchableOpacity
                      key={ft.key}
                      onPress={() => setFuelType(ft.key)}
                      style={{
                        flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                        backgroundColor: fuelType === ft.key ? '#00A78D' + '18' : colours.surface,
                        borderColor: fuelType === ft.key ? '#00A78D' : colours.border,
                      }}
                    >
                      <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: fuelType === ft.key ? '#00A78D' : colours.muted }}>{ft.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={{ backgroundColor: '#00A78D', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting
                    ? <ActivityIndicator color="white" />
                    : <Text style={{ color: 'white', fontWeight: '700', fontSize: fonts.lg }}>{t('Submit Price', 'Soumettre le prix')}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}
