import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in .env.local');
  process.exit(1);
}

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripePost(endpoint: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(`Stripe error on ${endpoint}: ${json.error?.message}`);
  return json;
}

interface ProductSpec {
  name: string;
  description: string;
  amount: number; // cents
  currency: string;
  recurring: { interval: 'month' } | null;
  key: string;
}

const PRODUCTS: ProductSpec[] = [
  {
    key: 'STRIPE_PRICE_BASIC_MONTHLY',
    name: 'affiche Basic',
    description: 'Featured badge on map, algorithm priority boost',
    amount: 4900,
    currency: 'cad',
    recurring: { interval: 'month' },
  },
  {
    key: 'STRIPE_PRICE_PRO_MONTHLY',
    name: 'affiche Pro',
    description: 'Basic + analytics dashboard',
    amount: 9900,
    currency: 'cad',
    recurring: { interval: 'month' },
  },
  {
    key: 'STRIPE_PRICE_FEATURED_MONTHLY',
    name: 'affiche Featured',
    description: 'Pro + stronger algorithm boost + Featured badge on event cards',
    amount: 14900,
    currency: 'cad',
    recurring: { interval: 'month' },
  },
  {
    key: 'STRIPE_PRICE_ORGANIZER_MONTHLY',
    name: 'affiche Organizer',
    description: 'Post unlimited events, Organizer badge on all your events',
    amount: 1999,
    currency: 'cad',
    recurring: { interval: 'month' },
  },
  {
    key: 'STRIPE_PRICE_BOOST_3DAY',
    name: 'Event Boost 3 Days',
    description: 'One-time event boost for 3 days',
    amount: 999,
    currency: 'cad',
    recurring: null,
  },
  {
    key: 'STRIPE_PRICE_BOOST_7DAY',
    name: 'Event Boost 7 Days',
    description: 'One-time event boost for 7 days',
    amount: 1999,
    currency: 'cad',
    recurring: null,
  },
  {
    key: 'STRIPE_PRICE_WEEKEND_SPOTLIGHT',
    name: 'Weekend Spotlight',
    description: 'One-time weekend spotlight placement',
    amount: 2999,
    currency: 'cad',
    recurring: null,
  },
];

async function run() {
  console.log('Creating Stripe products and prices...\n');

  const results: { key: string; priceId: string; productId: string }[] = [];

  for (const spec of PRODUCTS) {
    process.stdout.write(`Creating "${spec.name}"... `);

    const product = await stripePost('/products', {
      name: spec.name,
      description: spec.description,
    });

    const priceParams: Record<string, string> = {
      product: product.id,
      unit_amount: String(spec.amount),
      currency: spec.currency,
    };

    if (spec.recurring) {
      priceParams['recurring[interval]'] = spec.recurring.interval;
    }

    const price = await stripePost('/prices', priceParams);
    console.log(`done. price_id=${price.id}`);
    results.push({ key: spec.key, priceId: price.id, productId: product.id });
  }

  console.log('\n--- Add these to your .env.local ---');
  for (const r of results) {
    console.log(`${r.key}=${r.priceId}`);
  }
  console.log('-------------------------------------\n');

  console.log('Product IDs (for reference):');
  for (const r of results) {
    console.log(`  ${r.key.replace('PRICE', 'PRODUCT')}: ${r.productId}`);
  }
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
