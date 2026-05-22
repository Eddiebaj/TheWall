import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

// Set EXPO_PUBLIC_API_URL in .env.local — e.g. https://your-app.vercel.app
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

interface Venue {
  id: string;
  name: string;
  neighbourhood: string | null;
}

const PLANS = [
  {
    key: 'basic' as const,
    label: 'Basic',
    price: '$49',
    period: '/mo',
    features: ['Featured badge on map', 'Algorithm priority boost'],
    accent: '#FF3B5C',
  },
  {
    key: 'pro' as const,
    label: 'Pro',
    price: '$99',
    period: '/mo',
    features: ['Everything in Basic', 'Analytics dashboard'],
    accent: '#FF3B5C',
    popular: true,
  },
  {
    key: 'featured' as const,
    label: 'Featured',
    price: '$149',
    period: '/mo',
    features: ['Everything in Pro', 'Strongest algorithm boost', 'Featured badge on event cards'],
    accent: '#FFD700',
  },
];

export default function BusinessSignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro' | 'featured'>('pro');
  const [submitting, setSubmitting] = useState(false);

  // Venue picker state
  const [venueModalVisible, setVenueModalVisible] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueSearch, setVenueSearch] = useState('');
  const [venuesLoading, setVenuesLoading] = useState(false);
  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    loadVenues('');
  }, []);

  const loadVenues = async (q: string) => {
    setVenuesLoading(true);
    let query = supabase.from('venues').select('id, name, neighbourhood').order('name').limit(50);
    if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);
    const { data } = await query;
    setVenues((data as Venue[]) ?? []);
    setVenuesLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => loadVenues(venueSearch), 250);
    return () => clearTimeout(t);
  }, [venueSearch]);

  const validate = (): string | null => {
    if (!businessName.trim()) return 'Business name is required.';
    if (!contactName.trim()) return 'Contact name is required.';
    if (!email.trim() || !email.includes('@')) return 'A valid email is required.';
    if (!selectedVenue) return 'Please select your venue.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { Alert.alert('Missing info', err); return; }
    if (!API_BASE) {
      Alert.alert('Configuration error', 'EXPO_PUBLIC_API_URL is not set.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/business/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          business_name: businessName.trim(),
          contact_name: contactName.trim(),
          venue_id: selectedVenue!.id,
          plan: selectedPlan,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Failed to create checkout session.');
      await Linking.openURL(json.url);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ alignSelf: 'flex-start', marginBottom: 28 }}
          >
            <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* Header */}
          <View style={{ marginBottom: 32 }}>
            <View style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: '#FF3B5C22',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Ionicons name="business-outline" size={24} color="#FF3B5C" />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 }}>
              List Your Venue
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20 }}>
              Get featured on affiche and reach Toronto's nightlife audience.
            </Text>
          </View>

          {/* Form */}
          <Text style={labelStyle}>Business Name</Text>
          <TextInput
            style={inputStyle}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Lavelle Inc."
            placeholderTextColor="rgba(255,255,255,0.25)"
            autoCapitalize="words"
          />

          <Text style={labelStyle}>Contact Name</Text>
          <TextInput
            style={inputStyle}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Your full name"
            placeholderTextColor="rgba(255,255,255,0.25)"
            autoCapitalize="words"
          />

          <Text style={labelStyle}>Email</Text>
          <TextInput
            style={inputStyle}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.25)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={labelStyle}>Venue</Text>
          <TouchableOpacity
            style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            onPress={() => setVenueModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={{ color: selectedVenue ? '#fff' : 'rgba(255,255,255,0.25)', fontSize: 15 }}>
              {selectedVenue ? selectedVenue.name : 'Search for your venue…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.35)" />
          </TouchableOpacity>

          {/* Plan selection */}
          <Text style={[labelStyle, { marginTop: 24 }]}>Choose a Plan</Text>
          <View style={{ gap: 10, marginBottom: 8 }}>
            {PLANS.map((plan) => {
              const active = selectedPlan === plan.key;
              return (
                <TouchableOpacity
                  key={plan.key}
                  onPress={() => setSelectedPlan(plan.key)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 14,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? plan.accent : 'rgba(255,255,255,0.12)',
                    backgroundColor: active ? plan.accent + '12' : '#141414',
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{plan.label}</Text>
                      {plan.popular && (
                        <View style={{ backgroundColor: '#FF3B5C', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>POPULAR</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: active ? plan.accent : '#fff' }}>{plan.price}</Text>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{plan.period}</Text>
                    </View>
                  </View>
                  {plan.features.map((f) => (
                    <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
                      <Ionicons name="checkmark-circle" size={14} color={active ? plan.accent : 'rgba(255,255,255,0.35)'} />
                      <Text style={{ fontSize: 13, color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)' }}>{f}</Text>
                    </View>
                  ))}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#FF3B5C',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 24,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Continue to Payment</Text>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 12, lineHeight: 16 }}>
            You'll be redirected to Stripe to complete payment securely. Cancel anytime.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Venue picker modal */}
      <Modal
        visible={venueModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVenueModalVisible(false)}
        onShow={() => setTimeout(() => searchRef.current?.focus(), 100)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setVenueModalVisible(false)}
          />
          <View style={{
            backgroundColor: '#141414',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: insets.bottom + 16,
            maxHeight: '75%',
          }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 12, marginBottom: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            </View>

            <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', paddingHorizontal: 20, marginBottom: 12 }}>
              Select Your Venue
            </Text>

            {/* Search */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#1e1e1e', borderRadius: 10,
              marginHorizontal: 16, paddingHorizontal: 12,
              marginBottom: 12, gap: 8,
            }}>
              <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.35)" />
              <TextInput
                ref={searchRef}
                value={venueSearch}
                onChangeText={setVenueSearch}
                placeholder="Search venues…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={{ flex: 1, fontSize: 14, color: '#fff', paddingVertical: 10 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {venuesLoading ? (
              <ActivityIndicator color="#FF3B5C" style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={venues}
                keyExtractor={(v) => v.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedVenue(item);
                      setVenueModalVisible(false);
                      setVenueSearch('');
                    }}
                    style={{
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(255,255,255,0.06)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    activeOpacity={0.7}
                  >
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{item.name}</Text>
                      {item.neighbourhood && (
                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{item.neighbourhood}</Text>
                      )}
                    </View>
                    {selectedVenue?.id === item.id && (
                      <Ionicons name="checkmark-circle" size={18} color="#FF3B5C" />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 24, fontSize: 14 }}>
                    No venues found
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: '700' as const,
  color: 'rgba(255,255,255,0.5)',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
  marginBottom: 8,
  marginTop: 16,
};

const inputStyle = {
  backgroundColor: '#141414',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 15,
  color: '#fff' as const,
};
