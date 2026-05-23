import type { VercelRequest, VercelResponse } from '@vercel/node';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_API = 'https://api.stripe.com/v1';

const PRICE_IDS: Record<string, string> = {
  basic:    process.env.STRIPE_PRICE_BASIC_MONTHLY!,
  pro:      process.env.STRIPE_PRICE_PRO_MONTHLY!,
  featured: process.env.STRIPE_PRICE_FEATURED_MONTHLY!,
};

const SUCCESS_URL = process.env.BUSINESS_SUCCESS_URL ?? 'https://thewall.app/business/success';
const CANCEL_URL  = process.env.BUSINESS_CANCEL_URL  ?? 'https://thewall.app/business/signup';

async function stripePost(endpoint: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error?.message ?? 'Stripe error');
  return json;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, business_name, contact_name, venue_id, plan } = req.body ?? {};

    if (!email || !business_name || !contact_name || !venue_id || !plan) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['basic', 'pro', 'featured'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const priceId = PRICE_IDS[plan as string];
    if (!priceId) {
      return res.status(500).json({ error: `Price ID for plan "${plan}" is not configured` });
    }

    // Create Stripe customer
    const customer = await stripePost('/customers', {
      email,
      name: business_name,
      'metadata[contact_name]': contact_name,
      'metadata[venue_id]': venue_id,
      'metadata[plan]': plan,
    });

    // Create Checkout session
    const session = await stripePost('/checkout/sessions', {
      customer: customer.id,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      'subscription_data[metadata][venue_id]': venue_id,
      'subscription_data[metadata][plan]': plan,
      'subscription_data[metadata][business_name]': business_name,
      'subscription_data[metadata][contact_name]': contact_name,
      'metadata[venue_id]': venue_id,
      'metadata[plan]': plan,
      'metadata[business_name]': business_name,
      'metadata[contact_name]': contact_name,
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('[create-checkout]', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
