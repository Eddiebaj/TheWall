import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

// Disable body parsing so we can read the raw buffer for signature verification
export const config = { api: { bodyParser: false } };

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody: Buffer, header: string, secret: string): boolean {
  // header format: t=<timestamp>,v1=<sig1>,v1=<sig2>,...
  const parts: Record<string, string[]> = {};
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (!parts[k]) parts[k] = [];
    parts[k].push(v);
  }
  const timestamp = parts['t']?.[0];
  const signatures = parts['v1'] ?? [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject events older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  return signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sigHeader = req.headers['stripe-signature'];
  if (!sigHeader || typeof sigHeader !== 'string') {
    return res.status(400).json({ error: 'Missing Stripe-Signature header' });
  }

  const rawBody = await readRawBody(req);

  if (!verifyStripeSignature(rawBody, sigHeader, WEBHOOK_SECRET)) {
    console.warn('[stripe-webhook] Invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata ?? {};
    const { venue_id, plan, business_name, contact_name } = meta;

    if (!venue_id || !plan) {
      console.error('[stripe-webhook] Missing metadata on session', session.id);
      return res.status(200).json({ received: true }); // ack so Stripe doesn't retry
    }

    const stripe_customer_id = session.customer as string;
    const stripe_subscription_id = session.subscription as string;

    try {
      // Insert business subscription record
      const { error: subError } = await supabase.from('business_subscriptions').insert({
        venue_id,
        stripe_customer_id,
        stripe_subscription_id,
        plan,
        status: 'active',
      });
      if (subError) console.error('[stripe-webhook] Insert subscription error:', subError.message);

      // Promote the venue
      const { error: venueError } = await supabase
        .from('venues')
        .update({ is_featured: true, feature_tier: plan })
        .eq('id', venue_id);
      if (venueError) console.error('[stripe-webhook] Update venue error:', venueError.message);

      console.log(`[stripe-webhook] Activated ${plan} plan for venue ${venue_id} (${business_name ?? ''}, ${contact_name ?? ''})`);
    } catch (e: any) {
      console.error('[stripe-webhook] Unexpected error:', e.message);
      // Still return 200 to prevent Stripe from retrying endlessly
    }
  }

  return res.status(200).json({ received: true });
}
