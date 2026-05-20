import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ImageBackground, Linking, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { haversineKm } from '../lib/geo';

const CATEGORY_COLORS: { [key: string]: string } = {
  'Music': '#6c3fc7', 'Food & Drink': '#1a7a4a', 'Arts & Culture': '#b5450b',
  'Health': '#0077b6', 'Sports': '#006400', 'Business': '#444',
  'Community': '#0077a0', 'Family': '#e67e22', 'Science & Tech': '#2c3e7a', 'Hobbies': '#7b5ea7',
};

const inferEventCategory = (name: string, venue: string): { label: string; color: string } => {
  const txt = (name + ' ' + venue).toLowerCase();
  if (/concert|music|jazz|band|orchestra|choir|karaoke|vinyl|piano|singer|live.*music|opéra|opera|folk|rock|metal|indie|acoustic|blues|country.*night|dj\b|dubstep|hip.hop|rnb|r&b|punk|funk|reggae|dueling piano|open mic|standup|stand-up|comedy|improv/.test(txt)) return { label: 'Music & Arts', color: '#6c3fc7' };
  if (/drag|theatre|théâtre|lecture.*théâtrale|spoken|storytelling|poetry|burlesque|cabaret|variety|film|cinema|screening|art show|gallery|exhibit|museum|craft|paint|drawing|sketch|photography|ceramic|mural|studio|wallack|art supply|art fair|art hang/.test(txt)) return { label: 'Arts & Culture', color: '#b5450b' };
  if (/food|eat|drink|wine|beer|cocktail|dinner|lunch|brunch|breakfast|tasting|culinary|cuisine|chef|iftar|feast|brew|supper|tea|bistro|pub night|trivia|bingo|bowl/.test(txt)) return { label: 'Food & Drink', color: '#1a7a4a' };
  if (/yoga|fitness|run|5k|10k|race|workout|gym|wellness|pilates|meditation|health|dance|zumba|sport|hockey|basketball|soccer|tennis|swim|hike|cycling|bike/.test(txt)) return { label: 'Wellness', color: '#0077b6' };
  if (/career|hiring|job|networking|entrepreneur|business|startup|invest|workshop|seminar|conference|summit|panel|professional|tech|ai\b|data science|machine learning|fastest growing|breakfast of champions/.test(txt)) return { label: 'Business', color: '#444' };
  if (/family|kids|children|child|parent|youth|teen|baby|toddler|camp|school|tinkering|playgroup|march break/.test(txt)) return { label: 'Family', color: '#e67e22' };
  if (/disco|party|mixer|singles|social|nightclub|gala|celebration|fest|festival|reunion|meetup|meet-up|speed dating|trivia night/.test(txt)) return { label: 'Social', color: '#8e44ad' };
  if (/charity|fundrais|volunteer|community|indigenous|multicultural|cultural|awareness|inclusion|diversity|women|black|pride|spiritual|religious|church|mosque|iftar|reconcili/.test(txt)) return { label: 'Community', color: '#0077a0' };
  return { label: 'Community', color: '#0077a0' };
};

const modalStyles = {
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: 16, borderBottomWidth: 1 },
  modalClose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  modalCenter: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 60 },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
  events: any[];
  eventsLoading: boolean;
  eventsSource: 'ticketmaster' | 'eventbrite';
  setEventsSource: (s: 'ticketmaster' | 'eventbrite') => void;
  eventsSearch: string;
  setEventsSearch: (s: string) => void;
  eventsCategory: string | null;
  setEventsCategory: (c: string | null) => void;
  eventsFreeOnly: boolean;
  setEventsFreeOnly: (fn: ((prev: boolean) => boolean)) => void;
  eventsNearMe: boolean;
  toggleNearMe: () => void;
  eventsUserCoords: { lat: number; lng: number } | null;
  eventsGeoCache: { [addr: string]: { lat: number; lng: number } };
  eventsCacheTime: React.MutableRefObject<{ ticketmaster: number; eventbrite: number }>;
  fetchTicketmasterEvents: () => void;
  fetchEventbriteEvents: () => void;
  cardShadow: any;
}

export default function EventsModal({
  visible, onClose, colours, fonts, t, language,
  events, eventsLoading, eventsSource, setEventsSource,
  eventsSearch, setEventsSearch, eventsCategory, setEventsCategory,
  eventsFreeOnly, setEventsFreeOnly, eventsNearMe, toggleNearMe,
  eventsUserCoords, eventsGeoCache, eventsCacheTime,
  fetchTicketmasterEvents, fetchEventbriteEvents, cardShadow,
}: Props) {
  const EB_CATS = ['Music', 'Food & Drink', 'Arts & Culture', 'Health', 'Sports', 'Business', 'Community', 'Family', 'Science & Tech', 'Hobbies'];
  const TM_CATS = eventsSource === 'ticketmaster' ? [...new Set(events.map(e => e.category || 'Other'))].sort() : [];

  const filteredEvents = events.filter(ev => {
    const q = eventsSearch.toLowerCase();
    if (q && !ev.name.toLowerCase().includes(q) && !(ev.venue || '').toLowerCase().includes(q)) return false;
    if (eventsCategory) {
      if (eventsSource === 'ticketmaster') {
        if ((ev.category || 'Other') !== eventsCategory) return false;
      } else {
        if ((ev.category || '') !== eventsCategory) return false;
      }
    }
    if (eventsFreeOnly && !ev.free) return false;
    return true;
  });

  const catPills = eventsSource === 'ticketmaster' ? TM_CATS : EB_CATS;

  let displayEvents = filteredEvents;
  if (eventsNearMe && eventsUserCoords) {
    displayEvents = [...filteredEvents].sort((a, b) => {
      const coordA = a.address ? eventsGeoCache[a.address] : null;
      const coordB = b.address ? eventsGeoCache[b.address] : null;
      const distA = coordA ? haversineKm(eventsUserCoords!.lat, eventsUserCoords!.lng, coordA.lat, coordA.lng) : 999;
      const distB = coordB ? haversineKm(eventsUserCoords!.lat, eventsUserCoords!.lng, coordB.lat, coordB.lng) : 999;
      return distA - distB;
    });
  }

  const renderEventCard = (ev: typeof events[0]) => {
    const catLabel = eventsSource === 'eventbrite' ? (ev.category || 'Community') : null;
    const catColor = catLabel ? (CATEGORY_COLORS[catLabel] || '#555') : null;
    return (
      <TouchableOpacity key={ev.id} onPress={() => ev.url && Linking.openURL(ev.url)} style={{ marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, ...cardShadow }}>
        {ev.image && (
          <View style={{ height: 85, borderRadius: 9, overflow: 'hidden', marginBottom: 9, backgroundColor: colours.border }}>
            <ImageBackground source={{ uri: ev.image }} style={{ flex: 1 }} resizeMode="cover">
              <View style={{ position: 'absolute', top: 7, left: 7, flexDirection: 'row', gap: 5 }}>
                {catLabel && catColor && (
                  <View style={{ backgroundColor: catColor + 'ee', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>{catLabel}</Text>
                  </View>
                )}
                {ev.free && (
                  <View style={{ backgroundColor: '#2d7a3aee', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>FREE</Text>
                  </View>
                )}
              </View>
            </ImageBackground>
          </View>
        )}
        {!ev.image && catLabel && catColor && (
          <View style={{ backgroundColor: catColor + '18', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6, borderWidth: 1, borderColor: catColor + '40' }}>
            <Text style={{ color: catColor, fontSize: 10, fontWeight: '700' }}>{catLabel}</Text>
          </View>
        )}
        <Text style={{ fontSize: fonts.md, fontWeight: '800', color: colours.text, marginBottom: 3 }} numberOfLines={2}>{ev.name}</Text>
        {ev.date && (
          <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginBottom: 1 }}>
            {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
            {ev.time ? ` · ${ev.time}` : ''}
          </Text>
        )}
        {ev.venue ? <Text style={{ fontSize: fonts.sm, color: colours.muted }}>{ev.venue}</Text> : null}
        {ev.url && <Text style={{ fontSize: fonts.sm, color: colours.accent, fontWeight: '600', marginTop: 7 }}>
          {eventsSource === 'ticketmaster' ? 'Get tickets →' : ev.source === 'City of Ottawa' ? 'View on toronto.ca →' : 'Get tickets →'}
        </Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.modalContainer, { backgroundColor: colours.bg }]}>
        <View style={[modalStyles.modalHeader, { borderBottomColor: colours.border }]}>
          <View>
            <Text style={{ fontSize: fonts.xl, fontWeight: '800', color: colours.text }}>
              {eventsSource === 'ticketmaster' ? 'Live Events' : 'Community Events'}
            </Text>
            <Text style={{ fontSize: fonts.sm, color: colours.muted, marginTop: 2 }}>
              {eventsSource === 'ticketmaster' ? 'Ticketmaster · Toronto' : 'Arts & Community · Toronto'}
            </Text>
          </View>
          <TouchableOpacity style={[modalStyles.modalClose, { backgroundColor: colours.surface, borderColor: colours.border }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close', 'Fermer')}>
            <Ionicons name="close" size={18} color={colours.text} />
          </TouchableOpacity>
        </View>

        {/* Source toggle tabs */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colours.border }}>
          <TouchableOpacity
            onPress={() => { setEventsSource('ticketmaster'); setEventsCategory(null); fetchTicketmasterEvents(); }}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: eventsSource === 'ticketmaster' ? colours.accent : colours.surface }}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: eventsSource === 'ticketmaster' ? '#fff' : colours.text }}>{t('Live Events', 'Événements')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEventsSource('eventbrite'); setEventsCategory(null); fetchEventbriteEvents(); }}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: eventsSource === 'eventbrite' ? colours.accent : colours.surface }}
          >
            <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: eventsSource === 'eventbrite' ? '#fff' : colours.text }}>{t('Community', 'Communauté')}</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar + Near Me + Free */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              value={eventsSearch}
              onChangeText={setEventsSearch}
              placeholder={t('Search events...', 'Rechercher des \u00E9v\u00E9nements...')}
              placeholderTextColor={colours.muted}
              style={{ flex: 1, fontSize: fonts.sm, color: colours.text }}
            />
            {eventsSearch.length > 0 && (
              <TouchableOpacity onPress={() => setEventsSearch('')}>
                <Ionicons name="close-circle" size={16} color={colours.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={toggleNearMe} accessibilityRole="button" accessibilityState={{ selected: eventsNearMe }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, backgroundColor: eventsNearMe ? colours.accent : colours.surface, borderColor: eventsNearMe ? colours.accent : colours.border }}>
            <Ionicons name="location" size={14} color={eventsNearMe ? 'white' : colours.muted} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: eventsNearMe ? 'white' : colours.text }}>{t('Near Me', 'Pr\u00E8s de moi')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEventsFreeOnly(f => !f)} accessibilityRole="button" accessibilityState={{ selected: eventsFreeOnly }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, backgroundColor: eventsFreeOnly ? '#2d7a3a' : colours.surface, borderColor: eventsFreeOnly ? '#2d7a3a' : colours.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: eventsFreeOnly ? 'white' : colours.text }}>{t('Free', 'Gratuit')}</Text>
          </TouchableOpacity>
        </View>

        {/* Category filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 50, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          {(['All', ...catPills] as string[]).map(cat => {
            const active = cat === 'All' ? eventsCategory === null : eventsCategory === cat;
            const minW = Math.max(52, cat.length * 9 + 32);
            return (
              <Pressable
                key={cat}
                onPress={() => setEventsCategory(cat === 'All' ? null : (active ? null : cat))}
                style={({ pressed }) => ({
                  marginRight: 8,
                  width: minW,
                  height: 34,
                  borderRadius: 17,
                  opacity: pressed ? 0.7 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colours.accent : colours.surface,
                  borderWidth: 1,
                  borderColor: active ? colours.accent : colours.border,
                })}>
                <Text style={{ fontSize: 13, color: active ? '#ffffff' : '#111111' }}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {eventsLoading ? (
            <View style={modalStyles.modalCenter}><ActivityIndicator color={colours.accent} size="large" /></View>
          ) : displayEvents.length === 0 ? (
            <View style={modalStyles.modalCenter}>
              <Ionicons name="calendar-outline" size={36} color={colours.muted} />
              <Text style={{ color: colours.muted, marginTop: 12, textAlign: 'center' }}>
                {eventsSearch || eventsCategory ? t('No events match your filters.', 'Aucun événement ne correspond.') : t('No upcoming events found in Toronto.', 'Aucun événement à venir à Toronto.')}
              </Text>
              {!eventsSearch && !eventsCategory && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('Refresh events', 'Actualiser les événements')}
                  style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colours.accent, backgroundColor: colours.accent + '15' }}
                  onPress={() => { eventsCacheTime.current.ticketmaster = 0; eventsCacheTime.current.eventbrite = 0; fetchTicketmasterEvents(); fetchEventbriteEvents(); }}
                >
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: colours.accent }}>{t('Refresh', 'Actualiser')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayEvents.map(ev => renderEventCard(ev))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
