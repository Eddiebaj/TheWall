import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../../context/AppContext';

const GOOGLE_KEY = 'AIzaSyCKwAVVCbxHKsKViJ4Dq0ZQ5r6k-arue3E';

interface Place { description: string; place_id: string; }
interface LatLng { lat: number; lng: number; }

export default function PlannerScreen() {
  const { colours, language } = useApp();
  const t = (en: string, fr: string) => language === 'fr' ? fr : en;
  const fonts = { sm: 12, md: 14, lg: 17, xl: 22 };

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<Place[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Place[]>([]);
  const [fromCoords, setFromCoords] = useState<LatLng | null>(null);
  const [toCoords, setToCoords] = useState<LatLng | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  const fromDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardShadow = {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  };

  async function autocomplete(text: string, setter: (p: Place[]) => void) {
    if (text.length < 3) { setter([]); return; }
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:ca&location=45.4215,-75.6972&radius=30000&key=${GOOGLE_KEY}`
      );
      const data = await res.json();
      setter((data.predictions || []).slice(0, 5));
    } catch { setter([]); }
  }

  async function geocodePlaceId(placeId: string): Promise<LatLng | null> {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_KEY}`
      );
      const data = await res.json();
      return data.result?.geometry?.location || null;
    } catch { return null; }
  }

  async function useMyLocation() {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setFromCoords({ lat, lng });
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`
      );
      const data = await res.json();
      setFromText(data.results?.[0]?.formatted_address || t('My Location', 'Ma position'));
      setFromSuggestions([]);
    } finally { setLocLoading(false); }
  }

  function openInGoogleMaps() {
    const origin = fromCoords
      ? `${fromCoords.lat},${fromCoords.lng}`
      : encodeURIComponent(fromText);
    const destination = toCoords
      ? `${toCoords.lat},${toCoords.lng}`
      : encodeURIComponent(toText);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=transit`;
    Linking.openURL(url);
  }

  const canPlan = (fromCoords || fromText.length > 2) && (toCoords || toText.length > 2);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colours.bg },
    header: {
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: 16,
      backgroundColor: colours.surface,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
    },
    title: { fontSize: fonts.xl, fontWeight: '800', color: colours.text },
    subtitle: { fontSize: fonts.sm, color: colours.muted, marginTop: 2 },
    scroll: { flex: 1 },
    content: { padding: 20, gap: 12 },
    inputCard: {
      backgroundColor: colours.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colours.border,
      ...cardShadow,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    inputIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, fontSize: fonts.md, color: colours.text, paddingVertical: 8 },
    divider: { height: 1, backgroundColor: colours.border, marginVertical: 8, marginLeft: 42 },
    locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginLeft: 42 },
    suggestionsBox: {
      backgroundColor: colours.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colours.border,
      overflow: 'hidden',
      ...cardShadow,
    },
    suggestion: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
    },
    planBtn: {
      backgroundColor: colours.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    noteCard: {
      backgroundColor: colours.accent + '10',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colours.accent + '30',
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
    },
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Trip Planner', 'Planificateur')}</Text>
        <Text style={styles.subtitle}>{t('Plan your OC Transpo journey', 'Planifiez votre trajet OC Transpo')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Input Card */}
        <View style={styles.inputCard}>
          <View style={styles.inputRow}>
            <View style={[styles.inputIcon, { backgroundColor: colours.accent + '20' }]}>
              <Ionicons name="radio-button-on" size={16} color={colours.accent} />
            </View>
            <TextInput
              style={styles.input}
              placeholder={t('From...', 'De...')}
              placeholderTextColor={colours.muted}
              value={fromText}
              onChangeText={text => {
                setFromText(text);
                setFromCoords(null);
                if (fromDebounce.current) clearTimeout(fromDebounce.current);
                fromDebounce.current = setTimeout(() => autocomplete(text, setFromSuggestions), 300);
              }}
            />
            {fromText ? (
              <TouchableOpacity onPress={() => { setFromText(''); setFromCoords(null); setFromSuggestions([]); }}>
                <Ionicons name="close-circle" size={18} color={colours.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locLoading}>
            {locLoading
              ? <ActivityIndicator size="small" color={colours.accent} />
              : <Ionicons name="locate" size={14} color={colours.accent} />
            }
            <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600' }}>
              {t('Use my location', 'Utiliser ma position')}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.inputRow}>
            <View style={[styles.inputIcon, { backgroundColor: colours.red + '20' }]}>
              <Ionicons name="location" size={16} color={colours.red} />
            </View>
            <TextInput
              style={styles.input}
              placeholder={t('To...', 'À...')}
              placeholderTextColor={colours.muted}
              value={toText}
              onChangeText={text => {
                setToText(text);
                setToCoords(null);
                if (toDebounce.current) clearTimeout(toDebounce.current);
                toDebounce.current = setTimeout(() => autocomplete(text, setToSuggestions), 300);
              }}
            />
            {toText ? (
              <TouchableOpacity onPress={() => { setToText(''); setToCoords(null); setToSuggestions([]); }}>
                <Ionicons name="close-circle" size={18} color={colours.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Swap */}
        {(fromText || toText) ? (
          <TouchableOpacity
            style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4 }}
            onPress={() => {
              const tmpText = fromText; setFromText(toText); setToText(tmpText);
              const tmpCoords = fromCoords; setFromCoords(toCoords); setToCoords(tmpCoords);
              setFromSuggestions([]); setToSuggestions([]);
            }}
          >
            <Ionicons name="swap-vertical" size={16} color={colours.muted} />
            <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{t('Swap', 'Inverser')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* From Suggestions */}
        {fromSuggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {fromSuggestions.map(p => (
              <TouchableOpacity key={p.place_id} style={styles.suggestion} onPress={async () => {
                setFromText(p.description);
                setFromSuggestions([]);
                const coords = await geocodePlaceId(p.place_id);
                setFromCoords(coords);
              }}>
                <Text style={{ color: colours.text, fontSize: fonts.md }} numberOfLines={1}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* To Suggestions */}
        {toSuggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {toSuggestions.map(p => (
              <TouchableOpacity key={p.place_id} style={styles.suggestion} onPress={async () => {
                setToText(p.description);
                setToSuggestions([]);
                const coords = await geocodePlaceId(p.place_id);
                setToCoords(coords);
              }}>
                <Text style={{ color: colours.text, fontSize: fonts.md }} numberOfLines={1}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Plan Button */}
        <TouchableOpacity
          style={[styles.planBtn, { opacity: canPlan ? 1 : 0.5 }]}
          onPress={openInGoogleMaps}
          disabled={!canPlan}
        >
          <Ionicons name="navigate" size={18} color="white" />
          <Text style={{ color: 'white', fontWeight: '800', fontSize: fonts.lg }}>
            {t('Get Directions', 'Obtenir l\'itinéraire')}
          </Text>
        </TouchableOpacity>

        {/* Note */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={colours.accent} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: fonts.sm, color: colours.accent, lineHeight: 18 }}>
            {t(
              'In-app routing coming soon. Directions open in Google Maps with OC Transpo transit.',
              'Planification intégrée bientôt disponible. Google Maps s\'ouvre avec le transport OC Transpo.'
            )}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
