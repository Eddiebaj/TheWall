import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../context/AppContext';

const PLACES_API_KEY = 'AIzaSyCKwAVVCbxHKsKViJ4Dq0ZQ5r6k-arue3E';
const PLAN_URL = 'https://routeo-backend.vercel.app/api/plan';

type PlaceResult = { placeId: string; label: string; lat?: number; lng?: number };
type WalkStep = { distance: number; relativeDirection: string; streetName: string };
type Leg = {
  mode: string;
  startTime: number;
  endTime: number;
  duration: number;
  distance: number;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  routeShortName: string | null;
  routeLongName: string | null;
  headsign: string | null;
  intermediateStops: string[];
  steps: WalkStep[];
};
type Itinerary = {
  duration: number;
  startTime: number;
  endTime: number;
  transfers: number;
  walkDistance: number;
  legs: Leg[];
};

const LEG_COLOURS: Record<string, string> = {
  WALK: '#6b7f99',
  BUS: '#00A78D',
  TRAM: '#004890',
  RAIL: '#004890',
  SUBWAY: '#004890',
  FERRY: '#7b5ea7',
};

const LEG_ICONS: Record<string, string> = {
  WALK: 'walk',
  BUS: 'bus',
  TRAM: 'train',
  RAIL: 'train',
  SUBWAY: 'train',
  FERRY: 'boat',
};

function fmtTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m}${ampm}`;
}

function fmtDuration(secs: number) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtWalk(metres: number) {
  if (metres < 1000) return `${metres}m walk`;
  return `${(metres / 1000).toFixed(1)}km walk`;
}

function fmtDistance(metres: number) {
  if (metres < 1000) return `${metres}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

function directionIcon(dir: string): string {
  const map: Record<string, string> = {
    LEFT: 'arrow-back', SLIGHTLY_LEFT: 'arrow-back',
    RIGHT: 'arrow-forward', SLIGHTLY_RIGHT: 'arrow-forward',
    CONTINUE: 'arrow-up', HARD_LEFT: 'arrow-back',
    HARD_RIGHT: 'arrow-forward', U_TURN_LEFT: 'return-up-back',
    U_TURN_RIGHT: 'return-up-forward',
  };
  return map[dir] || 'arrow-up';
}

export default function PlannerScreen() {
  const { colours, fonts, t, language } = useApp();
  const params = useLocalSearchParams();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState<PlaceResult | null>(null);
  const [toPlace, setToPlace] = useState<PlaceResult | null>(null);
  const [fromResults, setFromResults] = useState<PlaceResult[]>([]);
  const [toResults, setToResults] = useState<PlaceResult[]>([]);
  const [activeInput, setActiveInput] = useState<'from' | 'to' | null>(null);

  const [departTime, setDepartTime] = useState<Date>(new Date());
  const [arriveBy, setArriveBy] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeInputText, setTimeInputText] = useState('');

  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const [expandedItinerary, setExpandedItinerary] = useState<Itinerary | null>(null);
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null);

  const isLight = colours.bg === '#f0f4f8';
  const cardShadow = isLight ? { shadowColor: '#004890', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 } : {};

  useEffect(() => {
    setTimeInputText(fmtTime(departTime.getTime()));
  }, [departTime]);

  // ── Autocomplete ─────────────────────────────────────────────
  const autocomplete = useCallback(async (text: string, field: 'from' | 'to') => {
    if (text.length < 2) { field === 'from' ? setFromResults([]) : setToResults([]); return; }
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&location=45.4215,-75.6972&radius=30000&strictbounds=false&key=${PLACES_API_KEY}`
      );
      const data = await resp.json();
      const results: PlaceResult[] = (data.predictions || []).slice(0, 5).map((p: any) => ({
        placeId: p.place_id,
        label: p.description,
      }));
      field === 'from' ? setFromResults(results) : setToResults(results);
    } catch {}
  }, []);

  const resolvePlace = async (place: PlaceResult): Promise<PlaceResult> => {
    if (place.lat && place.lng) return place;
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.placeId}&fields=geometry,name&key=${PLACES_API_KEY}`
      );
      const data = await resp.json();
      const loc = data.result?.geometry?.location;
      if (loc) return { ...place, lat: loc.lat, lng: loc.lng };
    } catch {}
    return place;
  };

  const useMyLocation = async (field: 'from' | 'to') => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location required', 'Enable location in Settings.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const label = geo[0] ? [geo[0].name, geo[0].street, geo[0].city].filter(Boolean).join(', ') : 'My Location';
      const place: PlaceResult = { placeId: 'current', label, lat, lng };
      if (field === 'from') { setFromPlace(place); setFromText(label); setFromResults([]); }
      else { setToPlace(place); setToText(label); setToResults([]); }
    } catch { Alert.alert('Error', 'Could not get location.'); }
  };

  const swap = () => {
    const tmpPlace = fromPlace; const tmpText = fromText;
    setFromPlace(toPlace); setFromText(toText);
    setToPlace(tmpPlace); setToText(tmpText);
    setFromResults([]); setToResults([]);
  };

  // ── Plan ─────────────────────────────────────────────────────
  const plan = async () => {
    if (!fromPlace?.lat || !toPlace?.lat) {
      Alert.alert('Missing locations', 'Enter both an origin and destination.');
      return;
    }
    Keyboard.dismiss();
    setLoading(true); setError(''); setSearched(true); setItineraries([]);

    const d = departTime;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const month = String(d.getMonth() + 1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const dateStr = `${month}-${day}-${d.getFullYear()}`;

    const url = `${PLAN_URL}?fromLat=${fromPlace.lat}&fromLng=${fromPlace.lng}&fromLabel=${encodeURIComponent(fromPlace.label)}&toLat=${toPlace.lat}&toLng=${toPlace.lng}&toLabel=${encodeURIComponent(toPlace.label)}&time=${encodeURIComponent(timeStr)}&date=${encodeURIComponent(dateStr)}&arriveBy=${arriveBy}`;

    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) { setError(data.error); }
      else if (!data.itineraries?.length) { setError('No routes found. Try a different time or destination.'); }
      else { setItineraries(data.itineraries); }
    } catch { setError('Could not connect to trip planner. Check your connection.'); }
    setLoading(false);
  };

  // ── Render helpers ────────────────────────────────────────────
  const renderLegPill = (leg: Leg, i: number) => {
    const color = LEG_COLOURS[leg.mode] || colours.accent;
    const icon = LEG_ICONS[leg.mode] || 'bus';
    return (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {i > 0 && <View style={{ width: 6, height: 1, backgroundColor: colours.border }} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: color + '18', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
          <Ionicons name={icon as any} size={10} color={color} />
          {leg.mode !== 'WALK' && leg.routeShortName && (
            <Text style={{ fontSize: 10, fontWeight: '800', color }}>{leg.routeShortName}</Text>
          )}
          {leg.mode === 'WALK' && (
            <Text style={{ fontSize: 10, fontWeight: '600', color }}>{fmtDistance(leg.distance)}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderItinerary = (itin: Itinerary, idx: number) => {
    const isFirst = idx === 0;
    return (
      <TouchableOpacity
        key={idx}
        onPress={() => setExpandedItinerary(itin)}
        style={[{ backgroundColor: colours.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: isFirst ? 1.5 : 1, borderColor: isFirst ? colours.accent : colours.border }, cardShadow]}
        activeOpacity={0.85}
      >
        {isFirst && (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: colours.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ color: 'white', fontSize: 9, fontWeight: '800' }}>BEST</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colours.text }}>{fmtDuration(itin.duration)}</Text>
          <Text style={{ fontSize: 13, color: colours.muted }}>
            {fmtTime(itin.startTime)} → {fmtTime(itin.endTime)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {itin.legs.map((leg, i) => renderLegPill(leg, i))}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ fontSize: 11, color: colours.muted }}>
            <Text style={{ fontWeight: '700' }}>{itin.transfers}</Text> transfer{itin.transfers !== 1 ? 's' : ''}
          </Text>
          <Text style={{ fontSize: 11, color: colours.muted }}>{fmtWalk(itin.walkDistance)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderExpandedItinerary = () => {
    if (!expandedItinerary) return null;
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setExpandedItinerary(null); setExpandedLeg(null); }}>
        <View style={{ flex: 1, backgroundColor: colours.bg }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colours.text }}>{fmtDuration(expandedItinerary.duration)}</Text>
              <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>{fmtTime(expandedItinerary.startTime)} → {fmtTime(expandedItinerary.endTime)}</Text>
            </View>
            <TouchableOpacity onPress={() => { setExpandedItinerary(null); setExpandedLeg(null); }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={colours.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {expandedItinerary.legs.map((leg, i) => {
              const color = LEG_COLOURS[leg.mode] || colours.accent;
              const icon = LEG_ICONS[leg.mode] || 'bus';
              const isExpanded = expandedLeg === i;
              const isWalk = leg.mode === 'WALK';
              return (
                <View key={i}>
                  {/* Leg card */}
                  <TouchableOpacity
                    onPress={() => setExpandedLeg(isExpanded ? null : i)}
                    style={{ backgroundColor: colours.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colours.border, borderLeftWidth: 4, borderLeftColor: color }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={icon as any} size={16} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        {isWalk ? (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                            Walk {fmtDistance(leg.distance)}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>
                            {leg.routeShortName ? `Route ${leg.routeShortName}` : leg.mode}
                            {leg.headsign ? <Text style={{ fontWeight: '500', color: colours.muted }}> → {leg.headsign}</Text> : null}
                          </Text>
                        )}
                        <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>
                          {leg.from.name} → {leg.to.name}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color }}>
                          {fmtTime(leg.startTime)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colours.muted }}>
                          {fmtDuration(leg.duration)}
                        </Text>
                      </View>
                    </View>

                    {/* Intermediate stops */}
                    {!isWalk && leg.intermediateStops.length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>
                          {leg.intermediateStops.length} stop{leg.intermediateStops.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}

                    {/* Expanded stops */}
                    {!isWalk && isExpanded && leg.intermediateStops.length > 0 && (
                      <View style={{ marginTop: 10, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: color + '40', gap: 6 }}>
                        {leg.intermediateStops.map((stop, si) => (
                          <Text key={si} style={{ fontSize: 12, color: colours.muted }}>• {stop}</Text>
                        ))}
                      </View>
                    )}

                    {/* Walk steps */}
                    {isWalk && isExpanded && leg.steps.length > 0 && (
                      <View style={{ marginTop: 10, gap: 6 }}>
                        {leg.steps.map((step, si) => (
                          <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name={directionIcon(step.relativeDirection) as any} size={14} color={colours.muted} />
                            <Text style={{ fontSize: 12, color: colours.muted, flex: 1 }}>
                              {step.relativeDirection !== 'CONTINUE' ? `${step.relativeDirection.toLowerCase().replace('_', ' ')} on ` : ''}
                              <Text style={{ fontWeight: '600', color: colours.text }}>{step.streetName}</Text>
                              <Text> ({fmtDistance(step.distance)})</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Expand toggle for walk */}
                    {isWalk && leg.steps.length > 0 && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colours.muted} />
                        <Text style={{ fontSize: 11, color: colours.muted }}>
                          {isExpanded ? 'Hide' : 'Show'} walking directions
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Connector line between legs */}
                  {i < expandedItinerary.legs.length - 1 && (
                    <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                      <View style={{ width: 2, height: 16, backgroundColor: colours.border }} />
                    </View>
                  )}
                </View>
              );
            })}

            {/* Arrive */}
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colours.accent + '12', borderRadius: 14, borderWidth: 1, borderColor: colours.accent + '30' }}>
              <Ionicons name="location" size={18} color={colours.accent} />
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.accent }}>Arrive {fmtTime(expandedItinerary.endTime)}</Text>
                <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }}>{toPlace?.label}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // ── Time picker modal ─────────────────────────────────────────
  const renderTimePicker = () => (
    <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
        <View style={{ backgroundColor: colours.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, backgroundColor: colours.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{arriveBy ? 'Arrive by' : 'Depart at'}</Text>
          <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 16 }}>Enter time (e.g. 2:30pm) or pick below</Text>

          {/* Depart / Arrive toggle */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[false, true].map(ab => (
              <TouchableOpacity key={String(ab)} onPress={() => setArriveBy(ab)} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: arriveBy === ab ? colours.accent : colours.border, backgroundColor: arriveBy === ab ? colours.accent + '15' : colours.surface, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: arriveBy === ab ? colours.accent : colours.muted }}>{ab ? 'Arrive by' : 'Depart at'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick time options */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {generateQuickTimes().map(({ label, date }) => {
              const isActive = fmtTime(departTime.getTime()) === fmtTime(date.getTime());
              return (
                <TouchableOpacity key={label} onPress={() => { setDepartTime(date); setShowTimePicker(false); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: isActive ? colours.accent : colours.border, backgroundColor: isActive ? colours.accent + '15' : colours.surface }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? colours.accent : colours.text }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={() => setShowTimePicker(false)} style={{ paddingVertical: 14, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // ── Main render ───────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colours.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {renderExpandedItinerary()}
      {renderTimePicker()}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: colours.text, letterSpacing: -0.5 }}>
            Trip <Text style={{ color: colours.accent }}>Planner</Text>
          </Text>
          <Text style={{ fontSize: 13, color: colours.muted, marginTop: 2 }}>OC Transpo · Real transit routing</Text>
        </View>

        {/* Input card */}
        <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 18, borderWidth: 1, borderColor: colours.border, padding: 4, marginBottom: 12 }, cardShadow]}>
          {/* From */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colours.accent, backgroundColor: colours.bg }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
              placeholder="From..."
              placeholderTextColor={colours.muted}
              value={fromText}
              onChangeText={text => { setFromText(text); setFromPlace(null); autocomplete(text, 'from'); }}
              onFocus={() => setActiveInput('from')}
            />
            <TouchableOpacity onPress={() => useMyLocation('from')} style={{ padding: 6 }}>
              <Ionicons name="locate" size={18} color={colours.accent} />
            </TouchableOpacity>
          </View>

          {/* Divider + swap */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
            <TouchableOpacity onPress={swap} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
              <Ionicons name="swap-vertical" size={14} color={colours.muted} />
            </TouchableOpacity>
            <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
          </View>

          {/* To */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 10 }}>
            <Ionicons name="location" size={12} color={colours.accent} style={{ marginLeft: -1 }} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colours.text, paddingVertical: 10 }}
              placeholder="To..."
              placeholderTextColor={colours.muted}
              value={toText}
              onChangeText={text => { setToText(text); setToPlace(null); autocomplete(text, 'to'); }}
              onFocus={() => setActiveInput('to')}
            />
            <TouchableOpacity onPress={() => useMyLocation('to')} style={{ padding: 6 }}>
              <Ionicons name="locate" size={18} color={colours.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Autocomplete results */}
        {(activeInput === 'from' ? fromResults : toResults).length > 0 && (
          <View style={[{ marginHorizontal: 20, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, marginBottom: 12, overflow: 'hidden' }, cardShadow]}>
            {(activeInput === 'from' ? fromResults : toResults).map((r, i) => (
              <TouchableOpacity
                key={r.placeId}
                onPress={async () => {
                  const resolved = await resolvePlace(r);
                  if (activeInput === 'from') { setFromPlace(resolved); setFromText(resolved.label); setFromResults([]); }
                  else { setToPlace(resolved); setToText(resolved.label); setToResults([]); }
                  setActiveInput(null); Keyboard.dismiss();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: i < (activeInput === 'from' ? fromResults : toResults).length - 1 ? 1 : 0, borderBottomColor: colours.border }}
              >
                <Ionicons name="location-outline" size={16} color={colours.muted} />
                <Text style={{ flex: 1, fontSize: 13, color: colours.text }} numberOfLines={1}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Time + Plan row */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => setShowTimePicker(true)}
            style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colours.surface, borderRadius: 14, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 14, paddingVertical: 12 }, cardShadow]}
          >
            <Ionicons name="time-outline" size={16} color={colours.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: colours.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{arriveBy ? 'Arrive by' : 'Depart at'}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colours.text }}>{fmtTime(departTime.getTime())}</Text>
            </View>
            <Ionicons name="chevron-down" size={14} color={colours.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={plan}
            style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, backgroundColor: colours.accent, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>Plan</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Results */}
        {!loading && searched && error ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 }}>
            <Ionicons name="map-outline" size={40} color={colours.muted} />
            <Text style={{ color: colours.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>No routes found</Text>
            <Text style={{ color: colours.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{error}</Text>
          </View>
        ) : !loading && itineraries.length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              {itineraries.length} route{itineraries.length !== 1 ? 's' : ''} found
            </Text>
            {itineraries.map((itin, i) => renderItinerary(itin, i))}
          </View>
        ) : !loading && !searched ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colours.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="navigate" size={28} color={colours.accent} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, textAlign: 'center' }}>Plan your trip</Text>
            <Text style={{ fontSize: 13, color: colours.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              Real OC Transpo routing with transfers,{'\n'}walk times, and live schedules.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function generateQuickTimes(): { label: string; date: Date }[] {
  const now = new Date();
  const results = [];
  results.push({ label: 'Now', date: now });
  for (const addMins of [15, 30, 60]) {
    const d = new Date(now.getTime() + addMins * 60000);
    d.setSeconds(0, 0);
    results.push({ label: `+${addMins}m`, date: d });
  }
  // Common times
  for (const [h, m] of [[8,0],[9,0],[12,0],[17,0],[18,0],[20,0]]) {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d > now) {
      const ampm = h >= 12 ? 'pm' : 'am';
      const hh = h % 12 || 12;
      results.push({ label: `${hh}:${String(m).padStart(2,'0')}${ampm}`, date: d });
    }
  }
  return results.slice(0, 8);
}
