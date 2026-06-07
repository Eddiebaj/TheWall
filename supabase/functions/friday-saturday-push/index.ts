import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (_req) => {
  try {
    const now = new Date();

    // Only run on Fridays (5) and Saturdays (6) in Toronto time (UTC-4/UTC-5).
    // The cron fires at midnight UTC = 8pm EDT / 7pm EST, so we check the
    // Toronto wall-clock day by subtracting 4 hours (EDT offset).
    const torontoOffset = -4 * 60; // minutes, EDT
    const torontoNow = new Date(now.getTime() + torontoOffset * 60 * 1000);
    const torontoDow = torontoNow.getUTCDay(); // 0=Sun … 6=Sat

    if (torontoDow !== 5 && torontoDow !== 6) {
      return new Response(JSON.stringify({ sent: 0, reason: 'not_friday_or_saturday' }), { status: 200 });
    }

    // Find users currently marked as down tonight (not expired).
    const { data: downRows, error: downErr } = await supabase
      .from('city_board_down_tonight')
      .select('user_id')
      .gt('expires_at', now.toISOString());

    if (downErr) {
      return new Response(JSON.stringify({ error: downErr.message }), { status: 500 });
    }

    if (!downRows || downRows.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'nobody_down_tonight' }), { status: 200 });
    }

    const downUserIds = downRows.map((r: any) => r.user_id as string);

    // Fetch display names for the down users.
    const { data: downProfiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', downUserIds);

    if (profilesErr) {
      return new Response(JSON.stringify({ error: profilesErr.message }), { status: 500 });
    }

    const displayNameMap = new Map<string, string>(
      (downProfiles ?? []).map((p: any) => [p.id, p.display_name ?? 'Someone'])
    );

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let sent = 0;

    // For each user who is down tonight, notify their accepted friends.
    for (const userId of downUserIds) {
      // Get accepted friends (both directions in friendships table).
      const { data: friendships, error: friendshipsErr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (friendshipsErr || !friendships || friendships.length === 0) continue;

      const friendIds = friendships.map((f: any) =>
        f.requester_id === userId ? f.addressee_id : f.requester_id
      );

      // Among those friends, how many are also down tonight?
      const alsoDownCount = friendIds.filter(id => downUserIds.includes(id)).length;

      const name = displayNameMap.get(userId) ?? 'Someone';
      const othersCount = alsoDownCount;
      const body = othersCount > 0
        ? `${name} and ${othersCount} other${othersCount === 1 ? '' : 's'} are going out tonight`
        : `${name} is going out tonight`;

      for (const friendId of friendIds) {
        // Don't notify users about themselves (guard — friendId should never equal userId).
        if (friendId === userId) continue;

        const resp = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: friendId,
            type: 'down_tonight',
            title: 'Tonight \uD83C\uDF06',
            body,
            data: { type: 'down_tonight', userId },
          }),
        });

        if (resp.ok) sent++;
      }
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
