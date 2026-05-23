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

// ── Types ────────────────────────────────────────────────────────────────────

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

interface TmClassification {
  segment?: { name?: string };
  genre?: { name?: string };
}

interface TmEvent {
  id: string;
  name: string;
  dates?: {
    start?: { localDate?: string; localTime?: string };
    end?: { localDate?: string; localTime?: string };
  };
  info?: string;
  description?: string;
  images?: TmImage[];
  url?: string;
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  classifications?: TmClassification[];
  _embedded?: { venues?: TmVenue[] };
}

interface DbVenue {
  id: string;
  name: string;
  address: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function bestImage(images: TmImage[]): string | null {
  if (!images || images.length === 0) return null;
  // Prefer 16_9 ratio, largest width
  const sorted = [...images].sort((a, b) => {
    const ratioScore = (i: TmImage) => (i.ratio === '16_9' ? 1 : 0);
    if (ratioScore(b) !== ratioScore(a)) return ratioScore(b) - ratioScore(a);
    return (b.width ?? 0) - (a.width ?? 0);
  });
  return sorted[0].url;
}

function matchVenue(tmVenue: TmVenue, dbVenues: DbVenue[]): DbVenue | null {
  if (!tmVenue.name) return null;

  const tmName = normalize(tmVenue.name);
  const tmAddr = normalize(tmVenue.address?.line1 ?? '');

  // 1. Exact name match
  const exact = dbVenues.find((v) => normalize(v.name) === tmName);
  if (exact) return exact;

  // 2. Partial name match (one contains the other)
  const partial = dbVenues.find((v) => {
    const dbName = normalize(v.name);
    return tmName.includes(dbName) || dbName.includes(tmName);
  });
  if (partial) return partial;

  // 3. Address match
  if (tmAddr.length > 4) {
    const byAddr = dbVenues.find((v) => {
      const dbAddr = normalize(v.address ?? '');
      return dbAddr.length > 4 && (tmAddr.includes(dbAddr) || dbAddr.includes(tmAddr));
    });
    if (byAddr) return byAddr;
  }

  return null;
}

function mapCategory(event: TmEvent): string | null {
  const cls = event.classifications?.[0];
  if (!cls) return null;
  const segment = cls.segment?.name ?? '';
  const genre = (cls.genre?.name ?? '').toLowerCase();
  if (segment === 'Music') return 'Concerts';
  if (segment === 'Sports') return 'Sports';
  if (segment === 'Arts & Theatre') {
    if (genre.includes('comedy')) return 'Comedy';
    return 'Art & Culture';
  }
  if (segment === 'Miscellaneous') {
    if (genre.includes('food') || genre.includes('drink')) return 'Food & Drinks';
    if (genre.includes('outdoor')) return 'Outdoor';
    if (genre.includes('community') || genre.includes('networking')) return 'Networking';
  }
  return null;
}

function entryType(event: TmEvent): string {
  const ranges = event.priceRanges;
  if (!ranges || ranges.length === 0) return 'Free';
  const min = ranges[0].min ?? 0;
  if (min === 0) return 'Free';
  return `$${min}+`;
}

// ── Fetch from Ticketmaster ──────────────────────────────────────────────────

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

    const data = await res.json();
    const pageEvents: TmEvent[] = data._embedded?.events ?? [];
    events.push(...pageEvents);

    const totalPages: number = data.page?.totalPages ?? 1;
    page++;
    if (page >= totalPages || pageEvents.length === 0) break;

    // Ticketmaster rate limit: ~5 req/sec
    await new Promise((r) => setTimeout(r, 250));
  }

  return events;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching venues from Supabase…');
  const { data: dbVenues, error: venuesErr } = await supabase
    .from('venues')
    .select('id, name, address');

  if (venuesErr) {
    console.error('Failed to load venues:', venuesErr.message);
    process.exit(1);
  }

  console.log(`Loaded ${dbVenues!.length} venues`);

  console.log('Fetching events from Ticketmaster (Toronto)…');
  const tmEvents = await fetchAllEvents();
  console.log(`Fetched ${tmEvents.length} events`);

  let matched = 0;
  let unmatched = 0;
  let upserted = 0;

  const rows = tmEvents
    .map((event) => {
      const tmVenueRaw = event._embedded?.venues?.[0];
      let venueId: string | null = null;

      if (tmVenueRaw) {
        const match = matchVenue(tmVenueRaw, dbVenues!);
        if (match) {
          venueId = match.id;
          matched++;
        } else {
          unmatched++;
        }
      } else {
        unmatched++;
      }

      const startDate = event.dates?.start?.localDate ?? null;
      if (!startDate) return null; // skip events with no date

      return {
        external_id: event.id,
        title: event.name,
        venue_id: venueId,
        event_date: startDate,
        event_time: event.dates?.start?.localTime ?? null,
        end_time: event.dates?.end?.localTime ?? null,
        description: event.description ?? event.info ?? null,
        poster_url: event.images ? bestImage(event.images) : null,
        ticket_url: event.url ?? null,
        entry_type: entryType(event),
        category: mapCategory(event),
        source: 'ticketmaster',
        business_id: null,
      };
    })
    .filter(Boolean) as object[];

  // Upsert in batches of 100
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('venue_events')
      .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });

    if (error) {
      console.error(`Upsert error (batch ${i / BATCH}):`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  console.log('');
  console.log(`Events fetched:        ${tmEvents.length}`);
  console.log(`Matched to venues:     ${matched}`);
  console.log(`Unmatched (venue=null):${unmatched}`);
  console.log(`Upserted rows:         ${upserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
