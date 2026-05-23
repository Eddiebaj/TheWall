import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Nightlife', 'Concerts', 'Comedy', 'Art', 'Sports',
  'Food', 'Outdoor', 'Networking', 'Social', 'Other',
] as const;

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

const ACCENT = '#FF3B5C';
const BG = '#0C0E12';
const CARD = '#131720';
const BORDER = '#1E2230';
const MUTED = '#666';
const TEXT = '#fff';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTimeDisplay(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${pad(m)} ${ampm}`;
}

function formatTime24(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
      {[1, 2, 3].map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && (
            <View style={{ width: 32, height: 1.5, backgroundColor: step > i ? ACCENT : BORDER, marginHorizontal: 4 }} />
          )}
          <View style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: step === s ? ACCENT : step > s ? ACCENT + '40' : BORDER,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {step > s ? (
              <Ionicons name="checkmark" size={14} color={ACCENT} />
            ) : (
              <Text style={{ fontSize: 12, fontWeight: '700', color: step === s ? TEXT : MUTED }}>{s}</Text>
            )}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
      {label}
    </Text>
  );
}

function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: selected ? ACCENT : BORDER,
        backgroundColor: selected ? ACCENT + '18' : 'transparent',
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? ACCENT : MUTED }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Venue {
  id: string;
  name: string;
  address: string | null;
  neighbourhood: string | null;
}

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [step, setStep] = useState(1);

  // Step 1
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');

  // Step 2
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<Date>(() => {
    const d = new Date(); d.setMinutes(0, 0, 0); return d;
  });
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [recurrence, setRecurrence] = useState<'once' | 'weekly' | 'biweekly' | 'monthly'>('once');
  const [entryType, setEntryType] = useState<'Free' | 'Paid'>('Free');
  const [ticketUrl, setTicketUrl] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');

  // Venue
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueSearch, setVenueSearch] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [customAddress, setCustomAddress] = useState('');

  // Date/time picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Step 3
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    supabase
      .from('venues')
      .select('id, name, address, neighbourhood')
      .order('name', { ascending: true })
      .limit(200)
      .then(({ data }) => { if (data) setVenues(data as Venue[]); });
  }, []);

  const filteredVenues = venueSearch.length > 0
    ? venues.filter(v => v.name.toLowerCase().includes(venueSearch.toLowerCase()))
    : venues.slice(0, 20);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (step === 1) {
      if (!title.trim()) { Alert.alert('Required', 'Please enter a title.'); return; }
      if (!description.trim()) { Alert.alert('Required', 'Please enter a description.'); return; }
    }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step === 1) { router.back(); return; }
    setStep(s => s - 1);
  };

  // ── Image picker ────────────────────────────────────────────────────────────

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to pick a cover image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverImageUri(result.assets[0].uri);
    }
  };

  // ── Publish ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!user) { Alert.alert('Sign in required', 'Sign in to create events.'); return; }
    setPublishing(true);

    try {
      let posterUrl: string | null = null;

      if (coverImageUri) {
        const ext = coverImageUri.split('.').pop() ?? 'jpg';
        const fileName = `${user.id}/${Date.now()}.${ext}`;
        const response = await fetch(coverImageUri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(fileName);
          posterUrl = urlData?.publicUrl ?? null;
        }
      }

      const row: Record<string, unknown> = {
        creator_id: user.id,
        title: title.trim(),
        description: description.trim(),
        category: category || null,
        visibility,
        event_date: formatDate(eventDate),
        event_time: formatTime24(startTime),
        end_time: endTime ? formatTime24(endTime) : null,
        recurrence,
        entry_type: entryType,
        ticket_url: entryType === 'Paid' && ticketUrl.trim() ? ticketUrl.trim() : null,
        max_attendees: maxAttendees ? parseInt(maxAttendees, 10) : null,
        poster_url: posterUrl,
        source: 'user',
      };

      if (useCustomLocation) {
        row.venue_id = null;
      } else if (selectedVenue) {
        row.venue_id = selectedVenue.id;
      }

      const { data, error } = await supabase
        .from('venue_events')
        .insert(row)
        .select('id')
        .single();

      if (error) throw error;

      router.replace(`/event/${data.id}` as any);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not publish event. Try again.');
    } finally {
      setPublishing(false);
    }
  };

  // ── Render steps ─────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View>
      <FieldLabel label="Event Title" />
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Friday Night Rooftop Party"
        placeholderTextColor={MUTED}
        style={inputStyle}
        returnKeyType="next"
        maxLength={80}
      />

      <View style={{ height: 20 }} />

      <FieldLabel label="Description" />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What's happening? Give people the vibe."
        placeholderTextColor={MUTED}
        style={[inputStyle, { height: 110, textAlignVertical: 'top', paddingTop: 14 }]}
        multiline
        maxLength={1000}
      />

      <View style={{ height: 20 }} />

      <FieldLabel label="Category" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <Pill key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>

      <View style={{ height: 20 }} />

      <FieldLabel label="Visibility" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={() => setVisibility('public')}
          activeOpacity={0.8}
          style={[segmentStyle, visibility === 'public' && segmentActiveStyle]}
        >
          <Ionicons name="globe-outline" size={16} color={visibility === 'public' ? ACCENT : MUTED} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: visibility === 'public' ? ACCENT : MUTED, marginLeft: 6 }}>
            Public
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setVisibility('friends')}
          activeOpacity={0.8}
          style={[segmentStyle, visibility === 'friends' && segmentActiveStyle]}
        >
          <Ionicons name="people-outline" size={16} color={visibility === 'friends' ? ACCENT : MUTED} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: visibility === 'friends' ? ACCENT : MUTED, marginLeft: 6 }}>
            Friends Only
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View>
      <FieldLabel label="Date" />
      <TouchableOpacity
        onPress={() => { setShowDatePicker(true); setShowStartPicker(false); setShowEndPicker(false); }}
        activeOpacity={0.8}
        style={pickerButtonStyle}
      >
        <Ionicons name="calendar-outline" size={18} color={MUTED} />
        <Text style={{ fontSize: 15, color: TEXT, marginLeft: 10, fontWeight: '500' }}>
          {eventDate.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={eventDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(_, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setEventDate(date);
          }}
          themeVariant="dark"
        />
      )}

      <View style={{ height: 16 }} />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <FieldLabel label="Start Time" />
          <TouchableOpacity
            onPress={() => { setShowStartPicker(true); setShowDatePicker(false); setShowEndPicker(false); }}
            activeOpacity={0.8}
            style={pickerButtonStyle}
          >
            <Ionicons name="time-outline" size={18} color={MUTED} />
            <Text style={{ fontSize: 15, color: TEXT, marginLeft: 10, fontWeight: '500' }}>
              {formatTimeDisplay(startTime)}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel label="End Time (optional)" />
          <TouchableOpacity
            onPress={() => { setShowEndPicker(true); setShowDatePicker(false); setShowStartPicker(false); }}
            activeOpacity={0.8}
            style={pickerButtonStyle}
          >
            <Ionicons name="time-outline" size={18} color={MUTED} />
            <Text style={{ fontSize: 15, color: endTime ? TEXT : MUTED, marginLeft: 10, fontWeight: '500' }}>
              {endTime ? formatTimeDisplay(endTime) : 'None'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => {
            setShowStartPicker(Platform.OS === 'ios');
            if (date) setStartTime(date);
          }}
          themeVariant="dark"
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endTime ?? startTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => {
            setShowEndPicker(Platform.OS === 'ios');
            if (date) setEndTime(date);
          }}
          themeVariant="dark"
        />
      )}

      <View style={{ height: 20 }} />

      <FieldLabel label="Recurrence" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {RECURRENCE_OPTIONS.map(opt => (
          <Pill
            key={opt.value}
            label={opt.label}
            selected={recurrence === opt.value}
            onPress={() => setRecurrence(opt.value as any)}
          />
        ))}
      </View>

      <View style={{ height: 20 }} />

      <FieldLabel label="Venue" />
      {!useCustomLocation ? (
        <View>
          <TouchableOpacity
            onPress={() => setVenueDropdownOpen(o => !o)}
            activeOpacity={0.8}
            style={pickerButtonStyle}
          >
            <Ionicons name="location-outline" size={18} color={MUTED} />
            <Text style={{ fontSize: 15, color: selectedVenue ? TEXT : MUTED, marginLeft: 10, flex: 1, fontWeight: '500' }}>
              {selectedVenue ? selectedVenue.name : 'Search venues...'}
            </Text>
            <Ionicons name={venueDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
          </TouchableOpacity>

          {venueDropdownOpen && (
            <View style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, marginTop: 4, maxHeight: 260 }}>
              <View style={{ padding: 10 }}>
                <TextInput
                  value={venueSearch}
                  onChangeText={setVenueSearch}
                  placeholder="Type to filter..."
                  placeholderTextColor={MUTED}
                  style={{ fontSize: 14, color: TEXT, paddingVertical: 6, paddingHorizontal: 4 }}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {filteredVenues.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => {
                      setSelectedVenue(v);
                      setVenueDropdownOpen(false);
                      setVenueSearch('');
                    }}
                    activeOpacity={0.8}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderTopWidth: 1,
                      borderTopColor: BORDER,
                      backgroundColor: selectedVenue?.id === v.id ? ACCENT + '18' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT }}>{v.name}</Text>
                    {v.address && (
                      <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{v.address}</Text>
                    )}
                  </TouchableOpacity>
                ))}
                {filteredVenues.length === 0 && (
                  <Text style={{ color: MUTED, fontSize: 14, padding: 16, textAlign: 'center' }}>No venues found</Text>
                )}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            onPress={() => { setUseCustomLocation(true); setSelectedVenue(null); }}
            activeOpacity={0.8}
            style={{ marginTop: 10 }}
          >
            <Text style={{ fontSize: 13, color: ACCENT, fontWeight: '600' }}>+ Add custom location</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <TextInput
            value={customAddress}
            onChangeText={setCustomAddress}
            placeholder="Enter address or location name"
            placeholderTextColor={MUTED}
            style={inputStyle}
          />
          <TouchableOpacity onPress={() => setUseCustomLocation(false)} activeOpacity={0.8} style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 13, color: MUTED, fontWeight: '600' }}>Use a venue from the list instead</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 20 }} />

      <FieldLabel label="Entry" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['Free', 'Paid'] as const).map(et => (
          <TouchableOpacity
            key={et}
            onPress={() => setEntryType(et)}
            activeOpacity={0.8}
            style={[segmentStyle, { flex: 1 }, entryType === et && segmentActiveStyle]}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: entryType === et ? ACCENT : MUTED }}>{et}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {entryType === 'Paid' && (
        <View style={{ marginTop: 16 }}>
          <FieldLabel label="Ticket URL (optional)" />
          <TextInput
            value={ticketUrl}
            onChangeText={setTicketUrl}
            placeholder="https://..."
            placeholderTextColor={MUTED}
            style={inputStyle}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>
      )}

      <View style={{ height: 16 }} />

      <FieldLabel label="Max Attendees (optional)" />
      <TextInput
        value={maxAttendees}
        onChangeText={v => setMaxAttendees(v.replace(/[^0-9]/g, ''))}
        placeholder="Leave blank for unlimited"
        placeholderTextColor={MUTED}
        style={inputStyle}
        keyboardType="number-pad"
      />
    </View>
  );

  const renderStep3 = () => {
    const dateStr = eventDate.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = endTime
      ? `${formatTimeDisplay(startTime)} to ${formatTimeDisplay(endTime)}`
      : formatTimeDisplay(startTime);
    const recurrenceLabel = RECURRENCE_OPTIONS.find(o => o.value === recurrence)?.label ?? recurrence;
    const venueName = useCustomLocation
      ? customAddress || 'Custom location'
      : selectedVenue?.name ?? 'No venue selected';

    return (
      <View>
        <FieldLabel label="Cover Image (optional)" />
        <TouchableOpacity
          onPress={pickImage}
          activeOpacity={0.8}
          style={{
            height: 160,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: BORDER,
            borderStyle: 'dashed',
            backgroundColor: CARD,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: 24,
          }}
        >
          {coverImageUri ? (
            <Image source={{ uri: coverImageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Ionicons name="image-outline" size={32} color={MUTED} />
              <Text style={{ fontSize: 14, color: MUTED, fontWeight: '500' }}>Tap to add a cover image</Text>
            </View>
          )}
        </TouchableOpacity>

        <FieldLabel label="Summary" />
        <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 12 }}>
          <SummaryRow icon="text" label="Title" value={title} />
          {category ? <SummaryRow icon="pricetag-outline" label="Category" value={category} /> : null}
          <SummaryRow icon="calendar-outline" label="Date" value={dateStr} />
          <SummaryRow icon="time-outline" label="Time" value={timeStr} />
          {recurrence !== 'once' && (
            <SummaryRow icon="repeat-outline" label="Recurrence" value={recurrenceLabel} />
          )}
          <SummaryRow icon="location-outline" label="Venue" value={venueName} />
          <SummaryRow icon="ticket-outline" label="Entry" value={entryType} />
          {maxAttendees ? <SummaryRow icon="people-outline" label="Max Attendees" value={maxAttendees} /> : null}
          <SummaryRow
            icon="globe-outline"
            label="Visibility"
            value={visibility === 'public' ? 'Public' : 'Friends Only'}
          />
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: BORDER,
      }}>
        <TouchableOpacity onPress={handleBack} style={{ padding: 4 }}>
          <Ionicons name={step === 1 ? 'close' : 'chevron-back'} size={24} color={TEXT} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' }}>
          {step === 1 ? 'Create Event' : step === 2 ? 'When & Where' : 'Review & Publish'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepIndicator step={step} />
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>

        {/* Footer button */}
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 20,
          paddingBottom: insets.bottom + 16,
          backgroundColor: BG,
          borderTopWidth: 0.5,
          borderTopColor: BORDER,
        }}>
          <TouchableOpacity
            onPress={step === 3 ? handlePublish : handleNext}
            disabled={publishing}
            activeOpacity={0.85}
            style={{
              backgroundColor: ACCENT,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: publishing ? 0.7 : 1,
            }}
          >
            {publishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                {step === 3 ? 'Publish Event' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Summary row helper ────────────────────────────────────────────────────────

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Ionicons name={icon as any} size={16} color={MUTED} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 }}>
          {label}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT }}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  backgroundColor: CARD,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 15 as const,
  color: TEXT,
  fontWeight: '500' as const,
};

const pickerButtonStyle = {
  backgroundColor: CARD,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

const segmentStyle = {
  flex: 1,
  paddingVertical: 12,
  borderRadius: 12,
  borderWidth: 1.5,
  borderColor: BORDER,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexDirection: 'row' as const,
};

const segmentActiveStyle = {
  borderColor: ACCENT,
  backgroundColor: ACCENT + '18',
};
