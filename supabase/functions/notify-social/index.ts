import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  try {
    const { type, payload } = await req.json();

    let tokens: string[] = [];
    let title = '';
    let body = '';

    if (type === 'rsvp') {
      // Someone RSVPed to a hangout  -  notify conversation members
      const { hangout_id, user_id, status, event_name } = payload;

      // Get user's display name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', user_id)
        .single();

      const name = profile?.display_name || profile?.username || 'Someone';
      const statusText = status === 'going' ? "is in" : status === 'interested' ? "is interested" : "can't make it";
      title = `${name} ${statusText}`;
      body = event_name || 'Check the group chat';

      // Get hangout's conversation members
      const { data: hangout } = await supabase
        .from('hangouts')
        .select('conversation_id')
        .eq('id', hangout_id)
        .single();

      if (hangout?.conversation_id) {
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', hangout.conversation_id)
          .neq('user_id', user_id);

        if (members?.length) {
          const userIds = members.map(m => m.user_id);
          const { data: tokenRows } = await supabase
            .from('push_tokens')
            .select('expo_token')
            .in('user_id', userIds);
          tokens = tokenRows?.map(r => r.expo_token) || [];
        }
      }
    }

    if (type === 'message') {
      // New message in group  -  notify other members
      const { conversation_id, sender_id, content, event_name } = payload;

      const { data: sender } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', sender_id)
        .single();

      const { data: conv } = await supabase
        .from('conversations')
        .select('name')
        .eq('id', conversation_id)
        .single();

      const name = sender?.display_name || sender?.username || 'Someone';
      title = `${name} in ${conv?.name || 'group'}`;
      body = event_name ? `shared ${event_name}` : (content?.substring(0, 100) || 'New message');

      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversation_id)
        .neq('user_id', sender_id);

      if (members?.length) {
        const userIds = members.map(m => m.user_id);
        const { data: tokenRows } = await supabase
          .from('push_tokens')
          .select('expo_token')
          .in('user_id', userIds);
        tokens = tokenRows?.map(r => r.expo_token) || [];
      }
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Send via Expo push API
    const messages = tokens.map(to => ({
      to,
      title,
      body,
      sound: 'default',
      data: { type, ...payload },
    }));

    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await resp.json();
    return new Response(JSON.stringify({ sent: tokens.length, result }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
