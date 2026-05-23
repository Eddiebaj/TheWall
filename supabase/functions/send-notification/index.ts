import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface SendNotificationRequest {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  try {
    const { user_id, type, title, body, data }: SendNotificationRequest = await req.json();

    if (!user_id || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, type, title, body' }),
        { status: 400 }
      );
    }

    // Look up the user's push token(s)
    const { data: tokenRows, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokenError) {
      return new Response(JSON.stringify({ error: tokenError.message }), { status: 500 });
    }

    const tokens = tokenRows?.map(r => r.token) ?? [];

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_tokens' }), { status: 200 });
    }

    // Send via Expo Push API
    const messages = tokens.map(to => ({
      to,
      title,
      body,
      sound: 'default',
      data: { type, ...data },
    }));

    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await resp.json();
    return new Response(JSON.stringify({ sent: tokens.length, result }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
