import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ImageBackground, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { resolveVenueCoords } from '../lib/ottawaVenues';
import RsvpButton from './RsvpButton';

export type EventItem = {
  id: string;
  name: string;
  date: string; // 'YYYY-MM-DD'
  time?: string; // 'HH:MM' 24h
  venue: string;
  url: string;
  image?: string;
  category?: string;
};

interface Props {
  events?: EventItem[];
  onPressEvent?: (event: EventItem) => void;
}

const TRANSIT_ESTIMATE_MINS = 30;

/** Returns minutes until you should leave to arrive on time, or null if not applicable. */
function calcLeaveInMins(evTimeMins: number, nowMins: number): number | null {
  const leaveIn = evTimeMins - TRANSIT_ESTIMATE_MINS - nowMins;
  if (leaveIn > 0 && leaveIn < 180) return leaveIn;
  return null;
}

export default function HappeningInOttawaSection({ events, onPressEvent }: Props) {
  const { colours, fonts, t, language } = useApp();

  if (!events || events.length === 0) return null;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA');
  const nowMins = now.getHours() * 60 + now.getMinutes();

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: fonts.sm, fontWeight: '600', color: colours.muted, paddingHorizontal: 20, marginBottom: 10 }}>
        {t('Happening in Toronto', 'Se passe à Toronto')}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
      >
        {events.map(ev => {
          const isTonight = ev.date === todayStr;
          const evTimeMins = ev.time
            ? (() => { const [h, m] = ev.time!.split(':').map(Number); return h * 60 + m; })()
            : null;
          const isStartingSoon = evTimeMins !== null && evTimeMins > nowMins && evTimeMins - nowMins <= 45;

          // "Leave in X min" badge — only for today's events with a known venue and resolvable coords
          const venueCoords = resolveVenueCoords(ev.venue);
          const leaveInMins = (isTonight && evTimeMins !== null && venueCoords !== null)
            ? calcLeaveInMins(evTimeMins, nowMins)
            : null;

          const formattedDate = new Date(ev.date + 'T12:00:00').toLocaleDateString(
            language === 'fr' ? 'fr-CA' : 'en-CA',
            { weekday: 'short', month: 'short', day: 'numeric' }
          );

          const badges = (
            <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              {isStartingSoon && (
                <View style={{ backgroundColor: '#FF6B00', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{t('Starting soon', 'Bientôt')}</Text>
                </View>
              )}
              {isTonight && !isStartingSoon && (
                <View style={{ backgroundColor: '#8B5CF6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{t('Tonight only', 'Ce soir seulement')}</Text>
                </View>
              )}
            </View>
          );

          return (
            <TouchableOpacity
              key={ev.id}
              activeOpacity={0.7}
              onPress={() => {
                onPressEvent?.(ev);
                if (ev.url) Linking.openURL(ev.url).catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel={ev.name}
              style={{
                width: 200,
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: colours.border,
                backgroundColor: colours.surface,
              }}
            >
              {/* Cover image */}
              {ev.image ? (
                <ImageBackground source={{ uri: ev.image }} style={{ width: '100%', height: 100 }} resizeMode="cover">
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                  {badges}
                </ImageBackground>
              ) : (
                <View style={{ width: '100%', height: 100, backgroundColor: '#026CDF18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="ticket" size={28} color="#026CDF" />
                  {badges}
                </View>
              )}

              {/* Text content */}
              <View style={{ padding: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={2}>{ev.name}</Text>
                <Text style={{ fontSize: 11, color: colours.muted, marginTop: 3 }} numberOfLines={1}>
                  {ev.venue}{ev.time ? ` · ${ev.time}` : ''}
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colours.accent, marginTop: 2 }}>
                  {formattedDate}
                </Text>

                {/* "Leave in X min" badge */}
                {leaveInMins !== null && (
                  <View style={{
                    marginTop: 6,
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#026CDF',
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}>
                    <Ionicons name="bus-outline" size={11} color="#fff" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                      {t(`Leave in ${leaveInMins} min`, `Partir dans ${leaveInMins} min`)}
                    </Text>
                  </View>
                )}
              </View>

              {/* RSVP */}
              <RsvpButton eventId={ev.id} eventSource="ticketmaster" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
