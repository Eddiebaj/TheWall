import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Haversine distance in km between two lat/lng points.
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

serve(async (_req) => {
  try {
    const now = new Date();

    // day_of_week: 0=Sun … 6=Sat, matching JS Date.getDay() convention.
    // The cron fires at 8pm UTC = 4pm EDT, matching Toronto 3-4pm happy hour window.
    // Use UTC day since the cron fires in the afternoon — UTC and Toronto dates align.
    const todayDow = now.getUTCDay();

    // Find active happy hours for today.
    const { data: deals, error: dealsErr } = await supabase
      .from('happy_hours')
      .select('id, venue_id, title, end_time')
      .eq('day_of_week', todayDow);

    if (dealsErr) {
      return new Response(JSON.stringify({ error: dealsErr.message }), { status: 500 });
    }

    if (!deals || deals.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_happy_hours_today' }), { status: 200 });
    }

    const venueIds = [...new Set(deals.map((d: any) => d.venue_id as string))];

    // Fetch venue names and coordinates.
    const { data: venues, error: venuesErr } = await supabase
      .from('venues')
      .select('id, name, latitude, longitude')
      .in('id', venueIds);

    if (venuesErr) {
      return new Response(JSON.stringify({ error: venuesErr.message }), { status: 500 });
    }

    const venueMap = new Map<string, any>(
      (venues ?? []).map((v: any) => [v.id, v])
    );

    // Fetch all users with push tokens.
    // TODO: once user location is stored (e.g. profiles.last_lat / last_lng),
    // filter here to only users within 5km of each venue.
    const { data: tokenRows, error: tokensErr } = await supabase
      .from('push_tokens')
      .select('user_id, token');

    if (tokensErr) {
      return new Response(JSON.stringify({ error: tokensErr.message }), { status: 500 });
    }

    if (!tokenRows || tokenRows.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_push_tokens' }), { status: 200 });
    }

    // Build a set of unique user_ids that have tokens.
    const allUserIds = [...new Set(tokenRows.map((r: any) => r.user_id as string))];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Rate-limit: track which users have already received a happy-hour push today.
    const notifiedToday = new Set<string>();
    const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

    let sent = 0;

    for (const deal of deals) {
      const venue = venueMap.get(deal.venue_id);
      if (!venue) continue;

      const venueLat: number | null = venue.latitude;
      const venueLng: number | null = venue.longitude;

      // Format end_time (stored as "HH:MM:SS" or "HH:MM").
      const endTimeFmt = (deal.end_time as string).slice(0, 5); // "HH:MM"

      for (const userId of allUserIds) {
        // Rate limit: one happy hour push per user per day.
        if (notifiedToday.has(userId)) continue;

        // Distance filter — skipped when venue has no coordinates.
        // TODO: also filter by user location once it is stored server-side.
        if (venueLat != null && venueLng != null) {
          // Without stored user location we cannot compute distance — send to all.
          // Replace this block with a real distance check once user lat/lng is available.
        }

        const resp = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            type: 'happy_hour',
            title: 'Happy Hour \uD83C\uDF7A',
            body: `Happy hour at ${venue.name} \u2014 ${deal.title}. Ends at ${endTimeFmt}`,
            data: { type: 'happy_hour', venueId: String(deal.venue_id), dealId: String(deal.id) },
          }),
        });

        if (resp.ok) {
          sent++;
          notifiedToday.add(userId);
        }
      }
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
