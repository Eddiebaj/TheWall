import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  events: any[];
  eventsLoading: boolean;
  colours: any;
  t: (en: string, fr: string) => string;
  getSocialVenues: () => any[];
  onEventPress: (url: string) => void;
}

export default function TonightSection({ events, eventsLoading, colours, t, getSocialVenues, onEventPress }: Props) {
  const today = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dateOptions = [
    { label: t('Tonight', 'Ce soir'), date: today },
    { label: t('Tomorrow', 'Demain'), date: new Date(today.getTime() + 86400000) },
    ...Array.from({ length: 4 }, (_, i) => {
      const d = new Date(today.getTime() + (i + 2) * 86400000);
      return { label: days[d.getDay()], date: d };
    }),
  ];
  const [selectedDateIdx, setSelectedDateIdx] = React.useState(0);
  const selectedDate = dateOptions[selectedDateIdx].date.toLocaleDateString('en-CA');

  if (eventsLoading) return (
    <View style={{ paddingTop: 20, alignItems: 'center', paddingBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 }}>
        {t('Tonight', 'Ce soir')}
      </Text>
      <ActivityIndicator color={colours.accent} />
    </View>
  );

  const tonightEvents = events.filter(ev => ev.date === selectedDate || (selectedDateIdx === 0 && ev.date >= new Date().toLocaleDateString('en-CA')));
  const now = new Date();
  const isAfter3pm = now.getHours() >= 15;
  const todayDeals = getSocialVenues();

  return (
    <View style={{ paddingTop: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          {dateOptions[selectedDateIdx].label}
        </Text>
      </View>

      {/* Date scroller */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }}>
        {dateOptions.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setSelectedDateIdx(i)}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, backgroundColor: selectedDateIdx === i ? colours.accent : colours.surface, borderColor: selectedDateIdx === i ? colours.accent : colours.border }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: selectedDateIdx === i ? 'white' : colours.text }}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Events */}
      {tonightEvents.length === 0 ? (
        <View style={{ marginHorizontal: 20, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colours.border, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colours.muted }}>{t('No events found', 'Aucun événement')}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
          {tonightEvents.slice(0, 8).map(ev => (
            <TouchableOpacity
              key={ev.id}
              onPress={() => onEventPress(ev.url)}
              style={{ width: 200, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}
            >
              {ev.image && <Image source={{ uri: ev.image }} style={{ width: '100%', height: 100 }} resizeMode="cover" />}
              <View style={{ padding: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={2}>{ev.name}</Text>
                <Text style={{ fontSize: 11, color: colours.muted, marginTop: 4 }} numberOfLines={1}>{ev.venue}</Text>
                {selectedDateIdx === 0 && ev.time && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="time-outline" size={11} color={colours.accent} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colours.accent }}>{ev.time}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Deals — time-gated after 3pm */}
      {isAfter3pm && selectedDateIdx === 0 && todayDeals.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 10 }}>
            {t('Deals Near You', 'Offres près de vous')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {todayDeals.slice(0, 6).map((v, i) => (
              <View key={i} style={{ width: 180, padding: 14, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: v.isActive ? '#7b5ea7' + '40' : colours.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  {v.isActive && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7b5ea7' }} />}
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text }} numberOfLines={1}>{v.name}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={2}>{v.activeDeals?.[0]?.description || v.upcomingDeals?.[0]?.description}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
