/** @typedef {{ query: Record<string, string>, body: any, method: string, headers: Record<string, string> }} VercelRequest */
/** @typedef {{ status: (code: number) => any, json: (body: any) => any, setHeader: (k: string, v: string) => void, end: () => void }} VercelResponse */

// In-memory rate limiter: max 5 requests per IP per hour
const rateLimitMap = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API = 'https://api.stripe.com/v1';

const PRICE_IDS = {
  basic:    process.env.STRIPE_PRICE_BASIC_MONTHLY,
  pro:      process.env.STRIPE_PRICE_PRO_MONTHLY,
  featured: process.env.STRIPE_PRICE_FEATURED_MONTHLY,
};

const SUCCESS_URL = process.env.BUSINESS_SUCCESS_URL ?? 'https://thewall.app/business/success';
const CANCEL_URL  = process.env.BUSINESS_CANCEL_URL  ?? 'https://thewall.app/business/signup';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function stripePost(endpoint, params) {
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Stripe error');
  return json;
}

async function lookupVenueByName(venueName) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const name = venueName.trim();
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  // 1. Try exact case-insensitive match first
  const exactRes = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?name=ilike.${encodeURIComponent(name)}&select=id,name&limit=1`,
    { headers }
  );
  if (exactRes.ok) {
    const exactRows = await exactRes.json();
    if (exactRows?.[0]) return exactRows[0];
  }

  // 2. Fall back to substring match
  const fuzzyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?name=ilike.${encodeURIComponent(`%${name}%`)}&select=id,name&limit=1`,
    { headers }
  );
  if (!fuzzyRes.ok) return null;
  const rows = await fuzzyRes.json();
  return rows?.[0] ?? null;
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? 'https://the-wall-gamma.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const { email, business_name, contact_name, venue_id, venue_name, plan } = req.body ?? {};

    if (!email || !business_name || !contact_name || !plan) {
      return res.status(400).json({ error: 'Missing required fields: email, business_name, contact_name, plan' });
    }

    if (!['basic', 'pro', 'featured'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be basic, pro, or featured.' });
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(500).json({ error: `Price ID for plan "${plan}" is not configured on the server.` });
    }

    // Resolve venue_id — accept direct ID (mobile) or name lookup (web form)
    let resolvedVenueId = venue_id ?? null;
    let resolvedVenueName = business_name;

    if (!resolvedVenueId && venue_name) {
      const venue = await lookupVenueByName(venue_name);
      if (venue) {
        resolvedVenueId = venue.id;
        resolvedVenueName = venue.name;
      }
    }

    if (!resolvedVenueId) {
      return res.status(400).json({ error: 'Could not find a matching venue. Please check your venue name.' });
    }

    // Create Stripe customer
    const customer = await stripePost('/customers', {
      email: email.trim().toLowerCase(),
      name: business_name,
      'metadata[contact_name]': contact_name,
      'metadata[venue_id]': resolvedVenueId,
      'metadata[venue_name]': resolvedVenueName,
      'metadata[plan]': plan,
      'metadata[business_email]': email.trim().toLowerCase(),
    });

    // Create Checkout session
    const session = await stripePost('/checkout/sessions', {
      customer: customer.id,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      customer_email: email.trim().toLowerCase(),
      'subscription_data[metadata][venue_id]': resolvedVenueId,
      'subscription_data[metadata][plan]': plan,
      'subscription_data[metadata][business_name]': business_name,
      'subscription_data[metadata][contact_name]': contact_name,
      'subscription_data[metadata][business_email]': email.trim().toLowerCase(),
      'metadata[venue_id]': resolvedVenueId,
      'metadata[plan]': plan,
      'metadata[business_name]': business_name,
      'metadata[contact_name]': contact_name,
      'metadata[business_email]': email.trim().toLowerCase(),
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('[create-checkout]', error);
    return res.status(500).json({ error: error.message });
  }
};
