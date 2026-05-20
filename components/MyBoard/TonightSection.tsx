import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Props {
  events: any[];
  eventsLoading: boolean;
  colours: any;
  t: (en: string, fr: string) => string;
  getSocialVenues: () => any[];
  onEventPress: (url: string) => void;
  onWhoIsIn: (event: any, action: 'going' | 'interested' | 'share') => void;
}

const EventCard = ({ ev, colours, t, onWhoIsIn }: { ev: any, colours: any, t: any, onWhoIsIn: any }) => {
  const [goingCount, setGoingCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    supabase
      .from('hangouts')
      .select('id')
      .eq('event_name', ev.name)
      .limit(1)
      .single()
      .then(({ data: hangout }) => {
        if (!hangout) return;
        supabase
          .from('hangout_rsvps')
          .select('*', { count: 'exact', head: true })
          .eq('hangout_id', hangout.id)
          .eq('status', 'going')
          .then(({ count }) => setGoingCount(count || 0));
      });
  }, [ev.name]);

  return (
    <TouchableOpacity
      onPress={() => ev.url && Linking.openURL(ev.url)}
      style={{ width: 200, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}
    >
      {ev.image && <Image source={{ uri: ev.image }} style={{ width: '100%', height: 100 }} resizeMode="cover" />}
      <View style={{ padding: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={2}>{ev.name}</Text>
        <Text style={{ fontSize: 11, color: colours.muted, marginTop: 4 }} numberOfLines={1}>{ev.venue}</Text>
        {ev.time && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Ionicons name="time-outline" size={11} color={colours.accent} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: colours.accent }}>{ev.time}</Text>
          </View>
        )}
        {goingCount !== null && goingCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Ionicons name="flame" size={12} color={colours.accent} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent }}>{goingCount} going</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => onWhoIsIn(ev)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colours.border }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>Who's in?</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const DealCard = ({ v, colours }: { v: any, colours: any }) => {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [counts, setCounts] = useState({ up: 0, down: 0 });

  useEffect(() => {
    const loadVotes = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('venue_votes')
        .select('vote, user_id')
        .eq('venue_name', v.name);
      if (data) {
        setCounts({ up: data.filter(d => d.vote === 'up').length, down: data.filter(d => d.vote === 'down').length });
        if (user) setVote(data.find(d => d.user_id === user.id)?.vote || null);
      }
    };
    loadVotes();
  }, [v.name]);

  const handleVote = async (newVote: 'up' | 'down') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (vote === newVote) {
      await supabase.from('venue_votes').delete().eq('user_id', user.id).eq('venue_name', v.name);
      setVote(null);
      setCounts(c => ({ ...c, [newVote]: c[newVote] - 1 }));
    } else {
      await supabase.from('venue_votes').upsert({ user_id: user.id, venue_name: v.name, vote: newVote }, { onConflict: 'user_id,venue_name' });
      const old = vote;
      setVote(newVote);
      setCounts(c => ({ ...c, [newVote]: c[newVote] + 1, ...(old ? { [old]: c[old] - 1 } : {}) }));
    }
  };

  return (
    <View style={{ width: 180, padding: 14, borderRadius: 16, backgroundColor: colours.surface, borderWidth: 1, borderColor: v.local_secret ? '#00A78D' + '40' : v.isActive ? '#7b5ea7' + '40' : colours.border }}>
      {v.local_secret && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Ionicons name="shield-checkmark" size={12} color="#00A78D" />
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#00A78D', textTransform: 'uppercase', letterSpacing: 0.5 }}>Local Secret</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {v.isActive && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7b5ea7' }} />}
        <Text style={{ fontSize: 12, fontWeight: '800', color: colours.text }} numberOfLines={1}>{v.name}</Text>
      </View>
      <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={2}>{v.activeDeals?.[0]?.description || v.upcomingDeals?.[0]?.description}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colours.border }}>
        <TouchableOpacity onPress={() => handleVote('up')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={vote === 'up' ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={vote === 'up' ? '#00A78D' : colours.muted} />
          <Text style={{ fontSize: 11, color: vote === 'up' ? '#00A78D' : colours.muted, fontWeight: '600' }}>{counts.up || ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleVote('down')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={vote === 'down' ? 'thumbs-down' : 'thumbs-down-outline'} size={14} color={vote === 'down' ? '#cc3b2a' : colours.muted} />
          <Text style={{ fontSize: 11, color: vote === 'down' ? '#cc3b2a' : colours.muted, fontWeight: '600' }}>{counts.down || ''}</Text>
        </TouchableOpacity>
        {counts.up >= 3 && counts.up / (counts.up + counts.down) > 0.7 && (
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="shield-checkmark" size={11} color="#00A78D" />
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#00A78D', textTransform: 'uppercase', letterSpacing: 0.5 }}>Local Favourite</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default function TonightSection({ events, eventsLoading, colours, t, getSocialVenues, onEventPress, onWhoIsIn }: Props) {
  const today = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dateOptions = [
    { label: t('Tonight', 'Ce soir'), date: today, mode: 'day' },
    { label: t('Tomorrow', 'Demain'), date: new Date(today.getTime() + 86400000), mode: 'day' },
    ...Array.from({ length: 4 }, (_, i) => {
      const d = new Date(today.getTime() + (i + 2) * 86400000);
      return { label: days[d.getDay()], date: d, mode: 'day' };
    }),
    { label: t('This Week', 'Cette semaine'), date: today, mode: 'week' },
    { label: t('This Month', 'Ce mois'), date: today, mode: 'month' },
  ];
  const [selectedDateIdx, setSelectedDateIdx] = React.useState(0);
  const [rsvpEvent, setRsvpEvent] = React.useState<any>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [shareEvent, setShareEvent] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [trending, setTrending] = useState<{ event_name: string, venue_name: string, score: number, count: number }[]>([]);

  React.useEffect(() => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = Date.now();

    supabase
      .from('hangout_rsvps')
      .select('hangout_id, status, created_at')
      .gte('created_at', since)
      .in('status', ['going', 'interested'])
      .then(async ({ data: rsvps, error }) => {
        console.log('[Trending] rsvps:', rsvps?.length, 'error:', error?.message);
        if (!rsvps?.length) return;

        const hangoutIds = [...new Set(rsvps.map(r => r.hangout_id))];
        const { data: hangouts } = await supabase
          .from('hangouts')
          .select('id, event_name, venue_name')
          .in('id', hangoutIds);

        console.log('[Trending] hangouts:', hangouts?.length);
        if (!hangouts?.length) return;

        const hangoutMap = Object.fromEntries(hangouts.map(h => [h.id, h]));
        const counts: Record<string, { event_name: string, venue_name: string, score: number, count: number }> = {};

        rsvps.forEach(r => {
          const h = hangoutMap[r.hangout_id];
          if (!h?.event_name) return;
          const age = now - new Date(r.created_at).getTime();
          const weight = age < 86400000 ? 3 : age < 604800000 ? 2 : 1;
          if (!counts[h.event_name]) counts[h.event_name] = { event_name: h.event_name, venue_name: h.venue_name, score: 0, count: 0 };
          counts[h.event_name].score += weight;
          counts[h.event_name].count++;
        });

        const sorted = Object.values(counts).sort((a, b) => b.score - a.score).slice(0, 5);
        console.log('[Trending] sorted:', sorted.length);
        setTrending(sorted);
      });
  }, []);

  const loadGroups = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('conversation_members')
      .select('conversation:conversations(id, name)')
      .eq('user_id', user.id);
    if (data) setGroups(data.map((d: any) => d.conversation).filter(Boolean));
  };
  if (eventsLoading) return (
    <View style={{ paddingTop: 20, alignItems: 'center', paddingBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 }}>
        {t('Tonight', 'Ce soir')}
      </Text>
      <ActivityIndicator color={colours.accent} />
    </View>
  );

  const selected = dateOptions[selectedDateIdx];
  const tonightEvents = events.filter(ev => {
    if (selected.mode === 'week') {
      const evDate = new Date(ev.date);
      const weekEnd = new Date(today.getTime() + 7 * 86400000);
      return evDate >= today && evDate <= weekEnd;
    }
    if (selected.mode === 'month') {
      const evDate = new Date(ev.date);
      const monthEnd = new Date(today.getTime() + 30 * 86400000);
      return evDate >= today && evDate <= monthEnd;
    }
    return ev.date === selected.date.toLocaleDateString('en-CA');
  });
  const now = new Date();
  const isAfter3pm = now.getHours() >= 15;
  const todayDeals = getSocialVenues();

  return (
    <View style={{ paddingTop: 20 }}>
      {/* Trending */}
      {trending.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 10 }}>
            {t('Trending', 'Tendances')}
          </Text>
          {trending.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: i < trending.length - 1 ? 1 : 0, borderBottomColor: colours.border }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colours.muted, width: 18 }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.text }} numberOfLines={1}>{item.event_name}</Text>
                {item.venue_name ? <Text style={{ fontSize: 11, color: colours.muted }} numberOfLines={1}>{item.venue_name}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="flame" size={12} color={colours.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colours.accent }}>{item.count}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

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
            <EventCard key={ev.id} ev={ev} colours={colours} t={t} onWhoIsIn={(ev) => setRsvpEvent(ev)} />
          ))}
        </ScrollView>
      )}

      {/* Deals  -  time-gated after 3pm */}
      {isAfter3pm && selectedDateIdx === 0 && todayDeals.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 10 }}>
            {t('Deals Near You', 'Offres près de vous')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {todayDeals.slice(0, 6).map((v, i) => (
              <DealCard key={i} v={v} colours={colours} />
            ))}
          </ScrollView>
        </View>
      )}
      {rsvpEvent && (
        <Modal visible={!!rsvpEvent} transparent animationType="slide" onRequestClose={() => setRsvpEvent(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setRsvpEvent(null)} />
          <View style={{ backgroundColor: colours.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: colours.text, marginBottom: 4 }}>{rsvpEvent.name}</Text>
            <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 24 }}>{rsvpEvent.venue}</Text>
            <TouchableOpacity onPress={() => { onWhoIsIn(rsvpEvent, 'going'); setRsvpEvent(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colours.accent + '15', borderWidth: 1, borderColor: colours.accent + '40', marginBottom: 10 }}>
              <Text style={{ fontSize: 22 }}>🙋</Text>
              <View><Text style={{ fontSize: 15, fontWeight: '700', color: colours.accent }}>I'm in</Text><Text style={{ fontSize: 12, color: colours.muted }}>Let your friends know you're going</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onWhoIsIn(rsvpEvent, 'interested'); setRsvpEvent(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colours.border + '40', borderWidth: 1, borderColor: colours.border, marginBottom: 10 }}>
              <Text style={{ fontSize: 22 }}>👀</Text>
              <View><Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>Interested</Text><Text style={{ fontSize: 12, color: colours.muted }}>Maybe  -  you'll see who else is going</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShareEvent(rsvpEvent); setRsvpEvent(null); loadGroups(); setShowGroupPicker(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colours.border + '40', borderWidth: 1, borderColor: colours.border }}>
              <Text style={{ fontSize: 22 }}>💬</Text>
              <View><Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>Share to group</Text><Text style={{ fontSize: 12, color: colours.muted }}>Send to a friend group chat</Text></View>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
      {showGroupPicker && (
        <Modal visible={showGroupPicker} transparent animationType="slide" onRequestClose={() => setShowGroupPicker(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowGroupPicker(false)} />
          <View style={{ backgroundColor: colours.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colours.border, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text, marginBottom: 4 }}>Share to group</Text>
            <Text style={{ fontSize: 13, color: colours.muted, marginBottom: 20 }} numberOfLines={1}>{shareEvent?.name}</Text>
            {groups.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colours.muted, textAlign: 'center' }}>No groups yet. Create one in the Friends tab.</Text>
              </View>
            ) : (
              groups.map(group => (
                <TouchableOpacity
                  key={group.id}
                  onPress={async () => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user || !shareEvent) return;
                    await supabase.from('messages').insert({
                      conversation_id: group.id,
                      sender_id: user.id,
                      type: 'event_share',
                      content: shareEvent.name,
                      metadata: {
                        name: shareEvent.name,
                        venue: shareEvent.venue,
                        date: shareEvent.date,
                        url: shareEvent.url,
                        image: shareEvent.image,
                      },
                    });
                    await supabase.functions.invoke('notify-social', {
                      body: {
                        type: 'message',
                        payload: {
                          conversation_id: group.id,
                          sender_id: user.id,
                          content: shareEvent.name,
                          event_name: shareEvent.name,
                        }
                      }
                    });
                    setShowGroupPicker(false);
                    setShareEvent(null);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colours.bg, borderWidth: 1, borderColor: colours.border, marginBottom: 8 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#7b5ea7' + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={18} color="#7b5ea7" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colours.text }}>{group.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colours.muted} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ))
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}
