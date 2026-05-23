import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ticketmasterKey = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!ticketmasterKey) {
  console.error('Missing EXPO_PUBLIC_TICKETMASTER_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── Types ─────────────────────────────────────────────────────────────────────

interface TmImage {
  url: string;
  ratio?: string;
  width?: number;
  height?: number;
}

interface TmVenue {
  name?: string;
  address?: { line1?: string };
}

interface TmEvent {
  id: string;
  name: string;
  dates?: {
    start?: { localDate?: string; localTime?: string };
  };
  images?: TmImage[];
  _embedded?: { venues?: TmVenue[] };
}

interface DbVenue {
  id: string;
  name: string;
  address: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchVenue(tmVenue: TmVenue, dbVenues: DbVenue[]): DbVenue | null {
  if (!tmVenue.name) return null;

  const tmName = normalize(tmVenue.name);
  const tmAddr = normalize(tmVenue.address?.line1 ?? '');

  const exact = dbVenues.find((v) => normalize(v.name) === tmName);
  if (exact) return exact;

  const partial = dbVenues.find((v) => {
    const dbName = normalize(v.name);
    return tmName.includes(dbName) || dbName.includes(tmName);
  });
  if (partial) return partial;

  if (tmAddr.length > 4) {
    const byAddr = dbVenues.find((v) => {
      const dbAddr = normalize(v.address ?? '');
      return dbAddr.length > 4 && (tmAddr.includes(dbAddr) || dbAddr.includes(tmAddr));
    });
    if (byAddr) return byAddr;
  }

  return null;
}

// ── Fetch from Ticketmaster ───────────────────────────────────────────────────

async function fetchAllEvents(): Promise<TmEvent[]> {
  const events: TmEvent[] = [];
  let page = 0;
  const size = 200;

  while (true) {
    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    url.searchParams.set('apikey', ticketmasterKey);
    url.searchParams.set('city', 'Toronto');
    url.searchParams.set('countryCode', 'CA');
    url.searchParams.set('size', String(size));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'date,asc');

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`Ticketmaster API error: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json() as { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };
    const pageEvents: TmEvent[] = data._embedded?.events ?? [];
    events.push(...pageEvents);

    const totalPages: number = data.page?.totalPages ?? 1;
    page++;
    if (page >= totalPages || pageEvents.length === 0) break;

    await new Promise((r) => setTimeout(r, 250));
  }

  return events;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching venues from Supabase…');
  const { data: dbVenues, error: venuesErr } = await supabase
    .from('venues')
    .select('id, name, address');

  if (venuesErr) {
    console.error('Failed to load venues:', venuesErr.message);
    process.exit(1);
  }
  console.log(`Loaded ${dbVenues!.length} db venues`);

  console.log('Fetching events from Ticketmaster (Toronto)…');
  const tmEvents = await fetchAllEvents();
  console.log(`Fetched ${tmEvents.length} events\n`);

  // Count events per unmatched TM venue
  const counts = new Map<string, { name: string; address: string; count: number }>();

  for (const event of tmEvents) {
    const tmVenue = event._embedded?.venues?.[0];
    if (!tmVenue?.name) continue;

    const matched = matchVenue(tmVenue, dbVenues!);
    if (matched) continue;

    const key = tmVenue.name;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        name: tmVenue.name,
        address: tmVenue.address?.line1 ?? '',
        count: 1,
      });
    }
  }

  const sorted = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 50);

  console.log(`${'#'.padEnd(4)} ${'Count'.padEnd(6)} ${'Venue Name'.padEnd(45)} Address`);
  console.log('-'.repeat(100));
  sorted.forEach((v, i) => {
    const rank = String(i + 1).padEnd(4);
    const count = String(v.count).padEnd(6);
    const name = v.name.slice(0, 44).padEnd(45);
    console.log(`${rank} ${count} ${name} ${v.address}`);
  });

  console.log(`\nTotal unmatched venues: ${counts.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
