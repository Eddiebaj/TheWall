import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (_req) => {
  try {
    const now = new Date().toISOString();
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    // Find events starting in the next 2 hours
    const { data: events, error: eventsError } = await supabase
      .from('venue_events')
      .select('id, title, start_time')
      .gte('start_time', now)
      .lte('start_time', twoHoursLater);

    if (eventsError) {
      return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_upcoming_events' }), { status: 200 });
    }

    const eventIds = events.map((e: any) => e.id);

    // Get all RSVPs for those events
    const { data: rsvps, error: rsvpsError } = await supabase
      .from('event_rsvps')
      .select('user_id, event_id')
      .in('event_id', eventIds)
      .eq('status', 'going');

    if (rsvpsError) {
      return new Response(JSON.stringify({ error: rsvpsError.message }), { status: 500 });
    }

    if (!rsvps || rsvps.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_rsvps' }), { status: 200 });
    }

    const eventMap = new Map(events.map((e: any) => [e.id, e]));
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let sent = 0;

    for (const rsvp of rsvps) {
      const event = eventMap.get(rsvp.event_id) as any;
      if (!event) continue;

      const resp = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: rsvp.user_id,
          type: 'event_reminder',
          title: 'Your event is starting soon',
          body: `${event.title} starts in less than 2 hours`,
          data: { type: 'event_reminder', eventId: String(rsvp.event_id) },
        }),
      });

      if (resp.ok) sent++;
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
