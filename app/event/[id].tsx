import React, { useEffect, useRef, useState } from 'react';
import ViewShot from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useAnalytics } from '../../lib/analytics';
import { sendNotification } from '../../lib/notificationHelpers';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventDetailSkeleton } from '../../components/Shimmer';

let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch {}

async function scheduleEventReminder(eventId: string, title: string, venueName: string, eventDate: string | null, startTime: string | null) {
  if (!Notifications || !eventDate || !startTime) return;
  try {
    const [h, m] = startTime.split(':').map(Number);
    const [year, month, day] = eventDate.split('-').map(Number);
    const eventStart = new Date(year, month - 1, day, h, m, 0);
    const triggerTime = new Date(eventStart.getTime() - 60 * 60 * 1000);
    if (triggerTime.getTime() <= Date.now()) return;
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Tonight's the night",
        body: `${title} starts in 1 hour at ${venueName}`,
        data: { eventId },
      },
      trigger: { type: 'date' as any, date: triggerTime },
    });
    await AsyncStorage.setItem(`notif_reminder_${eventId}`, identifier);
  } catch {}
}

async function cancelEventReminder(eventId: string) {
  if (!Notifications) return;
  try {
    const identifier = await AsyncStorage.getItem(`notif_reminder_${eventId}`);
    if (identifier) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      await AsyncStorage.removeItem(`notif_reminder_${eventId}`);
    }
  } catch {}
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const POSTER_HEIGHT = 300;

interface RsvpProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface GroupConv {
  id: string;
  name: string | null;
  memberCount: number;
}

interface EventDetail {
  id: string;
  title: string;
  poster_url: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  cover_charge: string | null;
  description: string | null;
  venue_id: string | null;
  venue: {
    name: string;
    neighbourhood: string | null;
    address: string | null;
  } | null;
  venue_name: string | null;
  location: string | null;
  goingCount: number;
  isGoing: boolean;
  isInterested: boolean;
  source?: string | null;
  creator_username?: string | null;
  creator_is_organizer?: boolean;
  organizer_name?: string | null;
  recurrence?: string | null;
  creator_id?: string | null;
}

function getEventTags(title: string): string[] {
  const t = title.toLowerCase();
  const tags: string[] = [];
  if (t.includes('live') || t.includes('band') || t.includes('music')) tags.push('Live Music');
  if (t.includes('concert')) tags.push('Concert');
  if (t.includes('dj') || t.includes('rave') || t.includes('techno') || t.includes('house') || t.includes('edm')) tags.push('DJ Set');
  if (t.includes('karaoke')) tags.push('Karaoke');
  if (t.includes('comedy') || t.includes('stand-up') || t.includes('standup')) tags.push('Comedy');
  if (t.includes('art') || t.includes('gallery') || t.includes('exhibit')) tags.push('Art');
  if (t.includes('trivia') || t.includes('quiz')) tags.push('Trivia');
  if (t.includes('game') || t.includes('sport') || t.includes('tournament')) tags.push('Games');
  if (t.includes('party') || t.includes('celebration') || t.includes('birthday') || t.includes('nye') || t.includes('halloween')) tags.push('Party');
  if (t.includes('brunch')) tags.push('Brunch');
  if (t.includes('wine') || t.includes('winery') || t.includes('vineyard')) tags.push('Wine');
  if (t.includes('cocktail') || t.includes('mixology')) tags.push('Cocktails');
  if (t.includes('happy hour') || t.includes('happyhour')) tags.push('Happy Hour');
  if (t.includes('food') || t.includes('taco') || t.includes('bbq') || t.includes('burger')) tags.push('Food & Drinks');
  if (t.includes('patio') || t.includes('outdoor') || t.includes('rooftop')) tags.push('Outdoor');
  if (t.includes('all ages') || t.includes('family') || t.includes('kids')) {
    tags.push('All Ages');
  } else {
    tags.push('19+');
  }
  if (tags.length < 3) tags.splice(tags.length - 1, 0, 'Bar');
  if (tags.length < 3) tags.splice(tags.length - 1, 0, 'Party');
  return tags;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colours } = useApp();
  const { user } = useAuth();

  const { capture } = useAnalytics();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvpProfiles, setRsvpProfiles] = useState<RsvpProfile[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [rsvpTableName, setRsvpTableName] = useState<'event_rsvps' | 'venue_event_rsvps'>('event_rsvps');

  // Plan status
  const [planStatus, setPlanStatus] = useState<{ inCount: number; totalInvited: number } | null>(null);

  // Edit/Delete (creator only)
  const [editVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Share sheet
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const posterRef = useRef<ViewShot>(null);

  // Friends/groups picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<GroupConv[]>([]);
  const [search, setSearch] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) {
      loadEvent();
      if (user) loadPlanStatus();
    }
  }, [id, user]);

  const loadPlanStatus = async () => {
    if (!user || !id) return;
    const { data } = await supabase
      .from('pending_plans')
      .select('invited_user_ids, responses')
      .eq('creator_id', user.id)
      .eq('event_id', id)
      .maybeSingle();
    if (data) {
      const responses = (data.responses || {}) as Record<string, string>;
      const inCount = Object.values(responses).filter(v => v === 'in').length;
      setPlanStatus({ inCount, totalInvited: (data.invited_user_ids || []).length });
    }
  };

  const loadEvent = async () => {
    setLoading(true);

    // Try legacy events table first, then venue_events
    let eventData: any = null;
    let isVenueEvent = false;

    const { data: legacyData } = await supabase
      .from('events')
      .select('id, title, poster_url, date, start_time, end_time, cover_charge, description, venue_id, venues(name, neighbourhood, address)')
      .eq('id', id)
      .maybeSingle();

    if (legacyData) {
      eventData = legacyData;
    } else {
      if (__DEV__) console.log('[EventDetail] looking up venue_event id:', id);
      const veSelect = '*, venues(name, neighbourhood, address)';
      const { data: veById, error: veByIdErr } = await supabase
        .from('venue_events')
        .select(veSelect)
        .eq('id', id)
        .single();
      if (__DEV__) console.log('[EventDetail] veById result:', veById, 'error:', veByIdErr);

      let veData = veById;
      if (!veData) {
        const { data: veByTm, error: veByTmErr } = await supabase
          .from('venue_events')
          .select(veSelect)
          .eq('ticketmaster_id', id)
          .single();
        if (__DEV__) console.log('[EventDetail] veByTicketmaster result:', veByTm, 'error:', veByTmErr);
        veData = veByTm;
      }

      if (veData) {
        eventData = veData;
        isVenueEvent = true;
      }
    }

    if (!eventData) {
      setLoading(false);
      return;
    }

    // Resolve creator profile for user-created events
    let creatorUsername: string | null = null;
    let creatorIsOrganizer = false;
    if (isVenueEvent && eventData.source === 'user' && eventData.creator_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('username, is_organizer')
        .eq('id', eventData.creator_id)
        .maybeSingle();
      creatorUsername = (prof as any)?.username ?? null;
      creatorIsOrganizer = (prof as any)?.is_organizer ?? false;
    }

    const rsvpTable = isVenueEvent ? 'venue_event_rsvps' : 'event_rsvps';
    setRsvpTableName(rsvpTable as 'event_rsvps' | 'venue_event_rsvps');
    const eventIdField = 'event_id';

    const { count: goingCount } = await supabase
      .from(rsvpTable)
      .select('*', { count: 'exact', head: true })
      .eq(eventIdField, id)
      .eq('status', 'going');

    let isGoing = false;
    let isInterested = false;
    if (user) {
      const [{ data: rsvp }, { data: interest }, { data: saved }] = await Promise.all([
        supabase.from(rsvpTable).select('status').eq(eventIdField, id).eq('user_id', user.id).maybeSingle(),
        supabase.from('event_interests').select('id').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
        supabase.from('saved_events').select('id').eq('event_id', id).eq('user_id', user.id).maybeSingle(),
      ]);
      isGoing = rsvp?.status === 'going';
      isInterested = !!interest;
      setIsSaved(!!saved);
    }

    const [{ data: rsvpRows }, { data: friendRows }] = await Promise.all([
      supabase
        .from(rsvpTable)
        .select('profiles(id, username, avatar_url)')
        .eq(eventIdField, id)
        .eq('status', 'going')
        .limit(20),
      user
        ? supabase
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        : Promise.resolve({ data: [] }),
    ]);

    const profiles = ((rsvpRows || []) as any[])
      .map((r: any) => r.profiles)
      .filter(Boolean) as RsvpProfile[];
    setRsvpProfiles(profiles);

    const ids = new Set<string>(
      ((friendRows || []) as any[]).map((f: any) =>
        f.requester_id === user?.id ? f.addressee_id : f.requester_id
      )
    );
    setFriendIds(ids);

    const startTime = isVenueEvent
      ? (eventData.event_time || null)
      : (eventData.start_time || null);

    setEvent({
      id: eventData.id,
      title: eventData.title,
      poster_url: eventData.poster_url || null,
      event_date: (isVenueEvent ? eventData.event_date : eventData.date) || null,
      start_time: startTime,
      end_time: eventData.end_time || null,
      cover_charge: eventData.cover_charge || eventData.entry_type || null,
      description: eventData.description || null,
      venue_id: eventData.venue_id || null,
      venue: eventData.venues || null,
      venue_name: eventData.venue_name || null,
      location: eventData.location || null,
      goingCount: goingCount || 0,
      isGoing,
      isInterested,
      source: isVenueEvent ? (eventData.source || null) : null,
      creator_username: creatorUsername,
      creator_is_organizer: creatorIsOrganizer,
      organizer_name: isVenueEvent ? (eventData.organizer_name || null) : null,
      recurrence: isVenueEvent ? (eventData.recurrence || null) : null,
      creator_id: isVenueEvent ? (eventData.creator_id || null) : null,
    });
    setLoading(false);
  };

  const handleToggleRsvp = async (status: 'going' | 'interested') => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to RSVP to events.');
      return;
    }
    if (!event) return;
    if (rsvpLoading) return;
    setRsvpLoading(true);

    const isActive = status === 'going' ? event.isGoing : event.isInterested;

    if (isActive) {
      hapticLight();
      if (status === 'going') {
        setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
        const { error } = await supabase.from(rsvpTableName).delete().eq('event_id', event.id).eq('user_id', user.id);
        if (error) setEvent(e => e ? { ...e, isGoing: true, goingCount: e.goingCount + 1 } : e);
        else cancelEventReminder(event.id);
      } else {
        setEvent(e => e ? { ...e, isInterested: false } : e);
        const { error } = await supabase.from('event_interests').delete().eq('event_id', event.id).eq('user_id', user.id);
        if (error) setEvent(e => e ? { ...e, isInterested: true } : e);
      }
    } else {
      if (status === 'going') {
        hapticSuccess();
        setEvent(e => e ? { ...e, isGoing: true, goingCount: e.goingCount + (e.isGoing ? 0 : 1) } : e);
        const { error } = await supabase.from(rsvpTableName).upsert({ event_id: event.id, user_id: user.id, status: 'going' }, { onConflict: 'event_id,user_id' });
        if (error) {
          setEvent(e => e ? { ...e, isGoing: false, goingCount: Math.max(0, e.goingCount - 1) } : e);
        } else {
          scheduleEventReminder(
            event.id,
            event.title,
            event.venue?.name ?? event.venue_name ?? '',
            event.event_date,
            event.start_time,
          );
          // Notify friends that user is going
          supabase
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
            .then(({ data: friendRows }) => {
              if (!friendRows) return;
              const { data: prof } = supabase.auth.getSession ? { data: null } : { data: null };
              supabase
                .from('profiles')
                .select('username, display_name')
                .eq('id', user.id)
                .single()
                .then(({ data: myProfile }) => {
                  const myHandle = myProfile?.username || myProfile?.display_name || 'Someone';
                  for (const row of friendRows) {
                    const friendId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
                    if (friendId === user.id) continue;
                    sendNotification(
                      friendId,
                      'friend_going',
                      'Tonight',
                      `@${myHandle} is going to ${event.title}`,
                      { type: 'friend_going', eventId: String(event.id) },
                      false,
                      'normal'
                    );
                  }
                });
            });
        }
      } else {
        hapticMedium();
        setEvent(e => e ? { ...e, isInterested: true } : e);
        const { error } = await supabase.from('event_interests').insert({ event_id: event.id, user_id: user.id });
        if (error) setEvent(e => e ? { ...e, isInterested: false } : e);
      }
    }
    setRsvpLoading(false);
  };

  const handleToggleSave = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to save events.');
      return;
    }
    if (!event) return;
    const nowSaved = !isSaved;
    setIsSaved(nowSaved);
    hapticLight();
    if (nowSaved) {
      capture('event_saved', { event_id: event.id });
      const { error } = await supabase.from('saved_events').upsert({ user_id: user.id, event_id: event.id });
      if (error) setIsSaved(false);
    } else {
      const { error } = await supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', event.id);
      if (error) setIsSaved(true);
    }
  };

  const handleShareExternal = async () => {
    if (!event) return;
    setShareSheetVisible(false);
    const venueName = event.venue?.name || 'a venue';
    const dateStr = event.event_date
      ? new Date(event.event_date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'an upcoming date';
    try {
      const uri = await (posterRef.current as any)?.capture();
      if (uri) {
        await Share.share({ url: uri, message: '' });
        return;
      }
    } catch (_) {
      // fall through to text share
    }
    Share.share({
      message: `Check out ${event.title} at ${venueName} on ${dateStr} - open in affiche: affiche://event/${event.id}`,
    });
  };

  const openFriendsPicker = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to share events.');
      return;
    }
    setShareSheetVisible(false);

    // Load friends
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const friendList: Friend[] = ((friendRows || []) as any[]).map((r: any) => {
      const other = r.requester_id === user.id ? r.addressee : r.requester;
      return other as Friend;
    }).filter(Boolean);

    // Load group conversations
    const { data: memberRows } = await supabase
      .from('conversation_members')
      .select('conversation_id, conversations(id, name, type, conversation_members(user_id))')
      .eq('user_id', user.id);

    const groupList: GroupConv[] = ((memberRows || []) as any[])
      .map((r: any) => r.conversations)
      .filter((c: any) => c && c.type === 'group')
      .map((c: any) => ({
        id: c.id,
        name: c.name || null,
        memberCount: (c.conversation_members || []).length,
      }));

    setFriends(friendList);
    setGroups(groupList);
    setSelectedFriendIds(new Set());
    setSelectedGroupIds(new Set());
    setSearch('');
    setPickerVisible(true);
  };

  const toggleFriend = (id: string) => {
    setSelectedFriendIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!user || !event) return;
    if (selectedFriendIds.size === 0 && selectedGroupIds.size === 0) return;
    setSending(true);

    const metadata = {
      event_id: event.id,
      title: event.title,
      venue_name: event.venue?.name || null,
      event_date: event.event_date || null,
    };

    try {
      // Resolve direct conversation IDs for each selected friend
      const directConvIds: string[] = [];

      if (selectedFriendIds.size > 0) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id, conversation_members(user_id)')
          .eq('type', 'direct');

        const existingConvs = (existing || []) as any[];

        for (const friendId of Array.from(selectedFriendIds)) {
          let convId: string | null = null;

          for (const conv of existingConvs) {
            const memberIds: string[] = (conv.conversation_members || []).map((m: any) => m.user_id);
            if (memberIds.includes(user.id) && memberIds.includes(friendId) && memberIds.length === 2) {
              convId = conv.id;
              break;
            }
          }

          if (!convId) {
            const { data: newConv, error: convErr } = await supabase
              .from('conversations')
              .insert({ type: 'direct' })
              .select('id')
              .single();
            if (convErr || !newConv) continue;
            convId = newConv.id;
            await supabase.from('conversation_members').insert([
              { conversation_id: convId, user_id: user.id },
              { conversation_id: convId, user_id: friendId },
            ]);
          }

          directConvIds.push(convId);
        }
      }

      const allConvIds = [...directConvIds, ...Array.from(selectedGroupIds)];

      const messages = allConvIds.map(convId => ({
        conversation_id: convId,
        sender_id: user.id,
        type: 'event_share',
        metadata,
      }));

      if (messages.length > 0) {
        const { error } = await supabase.from('messages').insert(messages);
        if (error) throw error;
      }

      setPickerVisible(false);
      const total = selectedFriendIds.size + selectedGroupIds.size;
      Alert.alert('Sent!', `Event shared with ${total} ${total === 1 ? 'conversation' : 'conversations'}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not send event.');
    } finally {
      setSending(false);
    }
  };

  const openEditModal = () => {
    if (!event) return;
    setEditTitle(event.title);
    setEditDate(event.event_date || '');
    setEditTime(event.start_time || '');
    setEditDescription(event.description || '');
    setEditVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!event) return;
    setEditLoading(true);
    const updates: any = {
      title: editTitle.trim(),
      event_date: editDate.trim() || null,
      event_time: editTime.trim() || null,
      description: editDescription.trim() || null,
    };
    const { error } = await supabase.from('venue_events').update(updates).eq('id', event.id);
    setEditLoading(false);
    if (error) {
      Alert.alert('Error', 'Could not save changes.');
    } else {
      setEvent(e => e ? { ...e, title: updates.title, event_date: updates.event_date, start_time: updates.event_time, description: updates.description } : e);
      setEditVisible(false);
    }
  };

  const handleDelete = () => {
    if (!event) return;
    Alert.alert('Delete Event', 'Are you sure you want to delete this event? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('venue_events').delete().eq('id', event.id);
          if (error) {
            Alert.alert('Error', 'Could not delete event.');
          } else {
            router.back();
          }
        },
      },
    ]);
  };

  const handleGetDirections = () => {
    const address = event?.venue?.address;
    if (!address) return;
    const encoded = encodeURIComponent(address);
    if (Platform.OS === 'android') {
      Linking.openURL(`geo:0,0?q=${encoded}`).catch(() =>
        Linking.openURL(`https://maps.google.com/maps?q=${encoded}`)
      );
    } else {
      Linking.openURL(`maps://?q=${encoded}`).catch(() =>
        Linking.openURL(`https://maps.apple.com/?q=${encoded}`)
      );
    }
  };

  if (loading) {
    return <EventDetailSkeleton paddingTop={insets.top} bg={colours.bg} />;
  }

  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: colours.muted, fontSize: 15 }}>Event not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colours.accent, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formatTime = (time: string | null): string | null => {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  const formattedDate = (() => {
    if (!event.event_date) return null;
    const [y, m, d] = event.event_date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  const formattedDateTime = (() => {
    if (!formattedDate) return null;
    const start = formatTime(event.start_time);
    const end = formatTime(event.end_time);
    if (start && end) return `${formattedDate} · ${start} – ${end}`;
    if (start) return `${formattedDate} · ${start}`;
    return formattedDate;
  })();

  const q = search.toLowerCase();
  const filteredFriends = friends.filter(f => f.username.toLowerCase().includes(q));
  const filteredGroups = groups.filter(g => (g.name || '').toLowerCase().includes(q));
  const totalSelected = selectedFriendIds.size + selectedGroupIds.size;

  const CARD = colours.card || '#1c1c1e';

  // Build unified tag list: neighbourhood + source badge + recurrence + event tags
  const unifiedTags: { label: string; icon?: string } [] = [];
  if (event.venue?.neighbourhood) unifiedTags.push({ label: event.venue.neighbourhood });
  if (event.source === 'user' && event.creator_is_organizer) unifiedTags.push({ label: 'Organizer' });
  else if (event.source !== 'user' && event.source != null) unifiedTags.push({ label: 'Venue' });
  if (event.recurrence && event.recurrence !== 'once') {
    const recurrenceLabels: Record<string, string> = { weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly' };
    unifiedTags.push({ label: recurrenceLabels[event.recurrence] ?? event.recurrence, icon: 'repeat-outline' });
  }
  getEventTags(event.title).forEach(t => unifiedTags.push({ label: t }));

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      {/* Hero image with gradient scrim */}
      <View style={{ width: SCREEN_WIDTH, height: POSTER_HEIGHT, backgroundColor: '#1a1a1a' }}>
        {event.poster_url ? (
          <Image source={{ uri: event.poster_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.2)" />
          </View>
        )}
        {/* Bottom gradient scrim — blends hero into content */}
        <LinearGradient
          colors={['transparent', colours.bg]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
          pointerEvents="none"
        />
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        {/* Bookmark + share */}
        <TouchableOpacity
          onPress={handleToggleSave}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 60,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={isSaved ? '#FF3B5C' : '#fff'} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShareSheetVisible(true)}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="share-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>

        {/* Title block: event title primary, venue secondary */}
        <Text style={{ fontSize: 26, fontWeight: '800', color: colours.text, lineHeight: 32, marginBottom: 6 }}>
          {event.title}
        </Text>
        <TouchableOpacity
          activeOpacity={event.venue_id ? 0.7 : 1}
          onPress={() => event.venue_id && router.push(`/venue/${event.venue_id}` as any)}
          style={{ marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: event.venue_id ? colours.accent : colours.muted }}>
            {event.venue?.name || event.venue_name || event.location || 'Unknown Venue'}
          </Text>
          {event.venue_id && <Ionicons name="chevron-forward" size={13} color={colours.accent} />}
        </TouchableOpacity>
        {event.source === 'user' && event.creator_username && (
          <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '500', marginBottom: 4 }}>
            by {event.organizer_name ? event.organizer_name : `@${event.creator_username}`}
          </Text>
        )}

        {/* Unified tags row */}
        {unifiedTags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14, marginBottom: 20 }}>
            {unifiedTags.map((tag, i) => (
              <View
                key={`${tag.label}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderRadius: 20,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.12)',
                }}
              >
                {tag.icon && <Ionicons name={tag.icon as any} size={12} color={colours.muted} />}
                <Text style={{ fontSize: 12, fontWeight: '600', color: colours.text }}>{tag.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Meta row: date/time + cover charge */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {formattedDateTime && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{formattedDateTime}</Text>
            </View>
          )}
          {event.cover_charge && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="ticket-outline" size={15} color={colours.muted} />
              <Text style={{ fontSize: 13, color: colours.muted, fontWeight: '600' }}>{event.cover_charge}</Text>
            </View>
          )}
        </View>

        {/* About section */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            About
          </Text>
          <Text style={{ fontSize: 15, color: colours.text, lineHeight: 23, opacity: 0.85 }}>
            {event.description ?? 'Details coming soon. Check back closer to the date for more info.'}
          </Text>
        </View>

        {/* Location */}
        {event.venue?.address && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 28 }}>
            <Ionicons name="location-outline" size={16} color={colours.muted} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colours.muted, fontWeight: '500' }}>
                {event.venue.address}
              </Text>
              <TouchableOpacity onPress={handleGetDirections} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600' }}>Get directions</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Who's going */}
        {rsvpProfiles.length > 0 && (() => {
          const friendProfiles = rsvpProfiles.filter(p => friendIds.has(p.id));
          const otherCount = rsvpProfiles.length - friendProfiles.length;
          const hasFriends = friendProfiles.length > 0;
          const orderedProfiles = [...friendProfiles, ...rsvpProfiles.filter(p => !friendIds.has(p.id))];
          const shownProfiles = orderedProfiles.slice(0, 6);
          const overflow = rsvpProfiles.length - shownProfiles.length;
          return (
            <View style={{ marginBottom: 28 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Who's going
                </Text>
                {hasFriends ? (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colours.accent }}>
                    {friendProfiles.length} {friendProfiles.length === 1 ? 'friend' : 'friends'}
                    {otherCount > 0 ? ` · +${otherCount} others` : ''}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted }}>
                    {rsvpProfiles.length} {rsvpProfiles.length === 1 ? 'person' : 'people'}
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {shownProfiles.map((p) => (
                  <View
                    key={p.id}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colours.accent,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: colours.bg,
                    }}
                  >
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                        {p.username[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                ))}
                {overflow > 0 && (
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: colours.bg,
                  }}>
                    <Text style={{ color: colours.muted, fontSize: 11, fontWeight: '700' }}>
                      +{overflow}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        {/* Action buttons */}
        <TouchableOpacity
          onPress={() => {
            if (!event.isGoing) capture('rsvp_tapped', { event_id: event.id });
            handleToggleRsvp('going');
          }}
          disabled={rsvpLoading}
          activeOpacity={0.85}
          style={{
            backgroundColor: event.isGoing ? 'transparent' : '#FF3B5C',
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            marginBottom: 10,
            borderWidth: event.isGoing ? 1.5 : 0,
            borderColor: event.isGoing ? 'rgba(74,222,128,0.5)' : 'transparent',
            opacity: rsvpLoading ? 0.6 : 1,
          }}
        >
          {event.isGoing && <Ionicons name="checkmark-circle" size={18} color="#4ade80" />}
          <Text style={{ fontSize: 16, fontWeight: '700', color: event.isGoing ? '#4ade80' : '#fff' }}>
            I'm Going
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleToggleRsvp('interested')}
          disabled={rsvpLoading}
          activeOpacity={0.85}
          style={{
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            marginBottom: 10,
            borderWidth: 1.5,
            borderColor: event.isInterested ? '#444' : colours.border,
            backgroundColor: event.isInterested ? '#1a1a1a' : 'transparent',
            opacity: rsvpLoading ? 0.6 : 1,
          }}
        >
          {event.isInterested && <Ionicons name="checkmark" size={16} color="#fff" />}
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            Interested
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            const params = new URLSearchParams({
              eventId: event.id,
              eventTitle: event.title,
              eventVenue: event.venue?.name || '',
              eventDate: event.event_date || '',
            });
            router.push(`/lets-go?${params.toString()}` as any);
          }}
          activeOpacity={0.85}
          style={{
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            marginBottom: 10,
            borderWidth: 1.5,
            borderColor: 'rgba(255,59,92,0.35)',
            backgroundColor: 'rgba(255,59,92,0.08)',
          }}
        >
          <Ionicons name="people-outline" size={18} color={colours.accent} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: colours.accent }}>
            Plan with friends
          </Text>
        </TouchableOpacity>

        {planStatus && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 2 }}>
            <Ionicons name="checkmark-circle-outline" size={14} color={colours.accent} />
            <Text style={{ fontSize: 13, color: colours.accent, fontWeight: '600' }}>
              {planStatus.inCount} of {planStatus.totalInvited} friends are in
            </Text>
          </View>
        )}

        {/* Share button */}
        <TouchableOpacity
          onPress={() => setShareSheetVisible(true)}
          activeOpacity={0.85}
          style={{
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            marginTop: 4,
            borderWidth: 1,
            borderColor: colours.border,
            backgroundColor: 'transparent',
          }}
        >
          <Ionicons name="share-outline" size={17} color={colours.muted} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: colours.muted }}>
            Share Event
          </Text>
        </TouchableOpacity>

        {/* Creator-only: Edit & Delete */}
        {user && event.creator_id === user.id && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              onPress={openEditModal}
              activeOpacity={0.85}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                borderWidth: 1,
                borderColor: colours.border,
                backgroundColor: 'transparent',
              }}
            >
              <Ionicons name="pencil-outline" size={16} color={colours.muted} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colours.muted }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.85}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                borderWidth: 1,
                borderColor: 'rgba(255,59,92,0.4)',
                backgroundColor: 'rgba(255,59,92,0.08)',
              }}
            >
              <Ionicons name="trash-outline" size={16} color={colours.accent} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colours.accent }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Hidden share poster */}
      <ViewShot
        ref={posterRef}
        options={{ format: 'png', quality: 1 }}
        style={{ position: 'absolute', top: -9999, left: -9999, width: 1080, height: 1920 }}
      >
        <View style={{ flex: 1, backgroundColor: '#0a0a0a', width: 1080, height: 1920 }}>
          {event.poster_url ? (
            <Image
              source={{ uri: event.poster_url }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 960 }}
              resizeMode="cover"
            />
          ) : null}
          {/* Bottom gradient overlay */}
          <View style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0, height: 960,
            backgroundColor: 'rgba(10,10,10,0.85)',
          }} />
          {/* affiche wordmark */}
          <Text style={{ position: 'absolute', top: 80, left: 80, fontSize: 48, fontWeight: '800', color: '#fff', letterSpacing: -1 }}>
            affiche
          </Text>
          {/* Red accent line */}
          <View style={{ position: 'absolute', top: 840, left: 80, width: 120, height: 5, backgroundColor: '#FF3B5C', borderRadius: 3 }} />
          {/* Event title */}
          <Text style={{ position: 'absolute', top: 880, left: 80, right: 80, fontSize: 96, fontWeight: '800', color: '#fff', lineHeight: 104 }} numberOfLines={3}>
            {event.title}
          </Text>
          {/* Venue and date */}
          <Text style={{ position: 'absolute', top: 1280, left: 80, right: 80, fontSize: 44, color: 'rgba(255,255,255,0.7)', fontWeight: '500' }}>
            {event.venue?.name || ''}{event.venue?.name && event.event_date ? '  \u00B7  ' : ''}{event.event_date ? new Date(event.event_date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
          </Text>
          {/* Watermark */}
          <Text style={{ position: 'absolute', bottom: 80, right: 80, fontSize: 36, color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>
            affiche.app
          </Text>
        </View>
      </ViewShot>

      {/* Share options sheet */}
      <Modal
        visible={shareSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShareSheetVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setShareSheetVisible(false)}
        />
        <View style={{
          backgroundColor: CARD,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 24,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, marginBottom: 16 }}>Share Event</Text>

          <TouchableOpacity
            onPress={openFriendsPicker}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colours.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people-outline" size={20} color={colours.accent} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Share to Friends or Groups</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Send via direct message or group chat</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShareExternal}
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="share-outline" size={20} color={colours.text} />
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>Share Externally</Text>
              <Text style={{ fontSize: 12, color: colours.muted, marginTop: 2 }}>Share outside the app</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Friends & groups picker */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        <View style={{
          backgroundColor: CARD,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: SCREEN_HEIGHT * 0.72,
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, flex: 1 }}>Send to Friends or Groups</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Ionicons name="close" size={22} color={colours.muted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{
            marginHorizontal: 20,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.07)',
            borderRadius: 10,
            paddingHorizontal: 12,
            gap: 8,
          }}>
            <Ionicons name="search-outline" size={16} color={colours.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search..."
              placeholderTextColor={colours.muted}
              style={{ flex: 1, fontSize: 14, color: colours.text, paddingVertical: 10 }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={[
              ...(filteredFriends.length > 0 ? [{ _type: 'section', label: 'Friends' } as any] : []),
              ...filteredFriends.map(f => ({ _type: 'friend', ...f })),
              ...(filteredGroups.length > 0 ? [{ _type: 'section', label: 'Groups' } as any] : []),
              ...filteredGroups.map(g => ({ _type: 'group', ...g })),
              ...(filteredFriends.length === 0 && filteredGroups.length === 0
                ? [{ _type: 'empty' } as any]
                : []),
            ]}
            keyExtractor={(item, i) => item._type === 'section' ? `section-${item.label}` : item._type === 'empty' ? 'empty' : item.id}
            renderItem={({ item }) => {
              if (item._type === 'section') {
                return (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colours.muted, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>
                    {item.label}
                  </Text>
                );
              }
              if (item._type === 'empty') {
                return (
                  <Text style={{ textAlign: 'center', color: colours.muted, fontSize: 14, paddingVertical: 32 }}>
                    {friends.length === 0 && groups.length === 0 ? 'No friends or groups yet' : 'No results'}
                  </Text>
                );
              }
              if (item._type === 'friend') {
                const selected = selectedFriendIds.has(item.id);
                return (
                  <TouchableOpacity
                    onPress={() => toggleFriend(item.id)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                  >
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: colours.accent,
                      overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{item.username[0].toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text, flex: 1 }}>@{item.username}</Text>
                    <View style={{
                      width: 24, height: 24, borderRadius: 12,
                      borderWidth: 2,
                      borderColor: selected ? colours.accent : 'rgba(255,255,255,0.2)',
                      backgroundColor: selected ? colours.accent : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              }
              // group
              const selected = selectedGroupIds.has(item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggleGroup(item.id)}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="people" size={20} color={colours.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colours.text }}>{item.name || 'Group Chat'}</Text>
                    <Text style={{ fontSize: 12, color: colours.muted, marginTop: 1 }}>{item.memberCount} members</Text>
                  </View>
                  <View style={{
                    width: 24, height: 24, borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? colours.accent : 'rgba(255,255,255,0.2)',
                    backgroundColor: selected ? colours.accent : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
            style={{ flexGrow: 0 }}
          />

          {/* Send button */}
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
            <TouchableOpacity
              onPress={handleSend}
              disabled={totalSelected === 0 || sending}
              activeOpacity={0.85}
              style={{
                backgroundColor: totalSelected > 0 ? colours.accent : 'rgba(255,255,255,0.1)',
                borderRadius: 14,
                paddingVertical: 15,
                alignItems: 'center',
              }}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: totalSelected > 0 ? '#fff' : colours.muted }}>
                  {totalSelected > 0 ? `Send to ${totalSelected} ${totalSelected === 1 ? 'chat' : 'chats'}` : 'Send'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Event Modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setEditVisible(false)}
        />
        <View style={{
          backgroundColor: CARD,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colours.text, flex: 1 }}>Edit Event</Text>
            <TouchableOpacity onPress={() => setEditVisible(false)}>
              <Ionicons name="close" size={22} color={colours.muted} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 6 }}>TITLE</Text>
          <TextInput
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Event title"
            placeholderTextColor={colours.muted}
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colours.text, marginBottom: 14 }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 6 }}>DATE (YYYY-MM-DD)</Text>
          <TextInput
            value={editDate}
            onChangeText={setEditDate}
            placeholder="e.g. 2025-12-31"
            placeholderTextColor={colours.muted}
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colours.text, marginBottom: 14 }}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 6 }}>TIME (HH:MM)</Text>
          <TextInput
            value={editTime}
            onChangeText={setEditTime}
            placeholder="e.g. 21:00"
            placeholderTextColor={colours.muted}
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colours.text, marginBottom: 14 }}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: colours.muted, marginBottom: 6 }}>DESCRIPTION</Text>
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder="Event description"
            placeholderTextColor={colours.muted}
            multiline
            numberOfLines={3}
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colours.text, marginBottom: 20, minHeight: 80, textAlignVertical: 'top' }}
          />

          <TouchableOpacity
            onPress={handleSaveEdit}
            disabled={editLoading || !editTitle.trim()}
            activeOpacity={0.85}
            style={{
              backgroundColor: editTitle.trim() ? colours.accent : 'rgba(255,255,255,0.1)',
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: 'center',
              opacity: editLoading ? 0.6 : 1,
            }}
          >
            {editLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
