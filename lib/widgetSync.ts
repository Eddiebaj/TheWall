import { supabase } from './supabase';

// Syncs tonight's events (with friend going counts) to the iOS widget via expo-constants shared UserDefaults.
// Writes to group.com.routeo.app app group which the AficheWidget reads.

export async function syncWidgetData(userId: string | null) {
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Load today's events from venue_events
    const { data: eventsData } = await supabase
      .from('venue_events')
      .select('id, title, event_date, event_time, venues(name)')
      .eq('event_date', today)
      .order('event_time', { ascending: true })
      .limit(5);

    if (!eventsData || eventsData.length === 0) return;

    // If user logged in, get friend RSVPs
    let friendGoingMap: Record<string, number> = {};
    if (userId) {
      const { data: friendRows } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (friendRows && friendRows.length > 0) {
        const friendIds = (friendRows as any[]).map((f: any) =>
          f.requester_id === userId ? f.addressee_id : f.requester_id
        );
        const eventIds = (eventsData as any[]).map((e: any) => e.id);
        const { data: rsvpData } = await supabase
          .from('venue_event_rsvps')
          .select('event_id, user_id')
          .in('event_id', eventIds)
          .in('user_id', friendIds)
          .eq('status', 'going');

        for (const r of (rsvpData || []) as any[]) {
          friendGoingMap[r.event_id] = (friendGoingMap[r.event_id] || 0) + 1;
        }
      }
    }

    function fmt12(t: string): string {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hh = h % 12 || 12;
      return m === 0 ? `${hh} ${ampm}` : `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    const widgetEvents = (eventsData as any[]).map((e: any) => ({
      id: String(e.id),
      title: e.title,
      venue: (e.venues as any)?.name || '',
      time: fmt12(e.event_time || ''),
      friendCount: friendGoingMap[e.id] || 0,
      friendAvatarUrls: [],
    }));

    // Sort by friendCount descending so highest friend signal shows first
    widgetEvents.sort((a, b) => b.friendCount - a.friendCount);

    // Write to shared UserDefaults via expo-constants / NativeModules if available.
    // This requires the native app group to be configured (it is: group.com.routeo.app).
    // We store in AsyncStorage as fallback so the widget data is at least cached.
    const payload = JSON.stringify(widgetEvents);

    // Use native UserDefaults if available (bare workflow / expo dev client)
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.RNUserDefaults) {
        NativeModules.RNUserDefaults.setString('affiche_widget_events', payload, 'group.com.routeo.app');
      } else if (NativeModules.SharedGroupPreferences) {
        NativeModules.SharedGroupPreferences.setItem('affiche_widget_events', payload, 'group.com.routeo.app');
      }
    } catch {}

    // Also store in AsyncStorage so the app can re-sync after restart
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('affiche_widget_events_cache', payload);
    } catch {}
  } catch (err) {
    // Non-critical, silently fail
    console.warn('[widgetSync] failed:', err);
  }
}
