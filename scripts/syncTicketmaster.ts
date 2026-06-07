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

// ── Geocoding ────────────────────────────────────────────────────────────────

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', `${address}, Toronto, Ontario, Canada`);
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'affiche-geocoder/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// URL substrings that indicate a generic/placeholder Ticketmaster image
const BAD_IMAGE_PATTERNS = [
  '_SOURCE-',       // low-res source-only variants Ticketmaster uses as placeholders
  'RETINA_PORTRAIT_3_2', // generic portrait stock used when no real image exists
  'RETINA_PORTRAIT_16_9', // same family
  'CUSTOM.jpg',     // Ticketmaster generic fallback filename
];

function isBadImage(url: string): boolean {
  return BAD_IMAGE_PATTERNS.some((p) => url.includes(p));
}

function bestImage(images: TmImage[]): string | null {
  if (!images || images.length === 0) return null;
  // Filter out known-bad placeholder images
  const good = images.filter((i) => i.url && !isBadImage(i.url));
  const candidates = good.length > 0 ? good : images; // fall back to all if everything is filtered
  // Prefer 16_9 ratio, largest width
  const sorted = [...candidates].sort((a, b) => {
    const ratioScore = (i: TmImage) => (i.ratio === '16_9' ? 1 : 0);
    if (ratioScore(b) !== ratioScore(a)) return ratioScore(b) - ratioScore(a);
    return (b.width ?? 0) - (a.width ?? 0);
  });
  const best = sorted[0].url;
  // If even the best available is bad, return null rather than write a placeholder
  return isBadImage(best) ? null : best;
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
  let created = 0;
  let unmatched = 0;
  let upserted = 0;
  let posterUpdated = 0;

  // poster_url is intentionally excluded from this shape so the main upsert
  // never overwrites manually fixed poster URLs on conflict.
  type MainRow = {
    external_id: string;
    title: string;
    venue_id: string | null;
    event_date: string;
    event_time: string | null;
    end_time: string | null;
    description: string | null;
    ticket_url: string | null;
    entry_type: string;
    source: string;
    business_id: null;
  };
  type PosterRow = { external_id: string; poster_url: string };

  const mainRows: MainRow[] = [];
  const posterRows: PosterRow[] = [];

  // Cache newly created venues so we can match later events to them within the same run.
  const createdVenueCache: DbVenue[] = [];

  for (const event of tmEvents) {
    const tmVenueRaw = event._embedded?.venues?.[0];
    let venueId: string | null = null;

    if (tmVenueRaw) {
      const allDbVenues = [...dbVenues!, ...createdVenueCache];
      const match = matchVenue(tmVenueRaw, allDbVenues);
      if (match) {
        venueId = match.id;
        matched++;
      } else if (tmVenueRaw.name) {
        // Create a new venue record for this Ticketmaster venue.
        const address = tmVenueRaw.address?.line1 ?? null;
        let lat: number | null = null;
        let lng: number | null = null;

        if (address) {
          const coords = await geocodeAddress(address);
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }

        const { data: newVenue, error: insertErr } = await supabase
          .from('venues')
          .insert({ name: tmVenueRaw.name, address, latitude: lat, longitude: lng })
          .select('id, name, address')
          .single();

        if (insertErr) {
          console.error(`Failed to create venue "${tmVenueRaw.name}":`, insertErr.message);
          unmatched++;
        } else {
          venueId = newVenue.id;
          createdVenueCache.push(newVenue as DbVenue);
          created++;
          const coordStr = lat !== null ? `${lat.toFixed(6)}, ${lng!.toFixed(6)}` : 'no coords';
          console.log(`  Created venue: ${tmVenueRaw.name} (${coordStr})`);
        }
      } else {
        unmatched++;
      }
    } else {
      unmatched++;
    }

    const startDate = event.dates?.start?.localDate ?? null;
    if (!startDate) continue; // skip events with no date

    mainRows.push({
      external_id: event.id,
      title: event.name,
      venue_id: venueId,
      event_date: startDate,
      event_time: event.dates?.start?.localTime ?? null,
      end_time: event.dates?.end?.localTime ?? null,
      description: event.description ?? event.info ?? null,
      ticket_url: event.url ?? null,
      entry_type: entryType(event),
      source: 'ticketmaster',
      business_id: null,
    });

    const goodPoster = event.images ? bestImage(event.images) : null;
    if (goodPoster) {
      posterRows.push({ external_id: event.id, poster_url: goodPoster });
    }
  }

  // ── Pass 1: upsert core fields (poster_url excluded → never overwrites manual fixes) ──
  const BATCH = 100;
  for (let i = 0; i < mainRows.length; i += BATCH) {
    const batch = mainRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('venue_events')
      .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });

    if (error) {
      console.error(`Upsert error (batch ${i / BATCH}):`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  // ── Pass 2: update poster_url only where DB value is null or a known-bad placeholder ──
  // Fetch current poster_url for all events that have a good candidate image.
  for (let i = 0; i < posterRows.length; i += BATCH) {
    const batch = posterRows.slice(i, i + BATCH);
    const ids = batch.map((r) => r.external_id);

    const { data: existing, error: fetchErr } = await supabase
      .from('venue_events')
      .select('external_id, poster_url')
      .in('external_id', ids);

    if (fetchErr) {
      console.error('Poster fetch error:', fetchErr.message);
      continue;
    }

    const existingMap = new Map((existing ?? []).map((r) => [r.external_id, r.poster_url]));

    for (const row of batch) {
      const current: string | null = existingMap.get(row.external_id) ?? null;
      // Only overwrite if the DB has no image or has a known-bad placeholder
      if (current === null || isBadImage(current)) {
        const { error: updateErr } = await supabase
          .from('venue_events')
          .update({ poster_url: row.poster_url })
          .eq('external_id', row.external_id);
        if (updateErr) {
          console.error(`Poster update error (${row.external_id}):`, updateErr.message);
        } else {
          posterUpdated++;
        }
      }
    }
  }

  console.log('');
  console.log(`Events fetched:        ${tmEvents.length}`);
  console.log(`Matched to venues:     ${matched}`);
  console.log(`Venues created:        ${created}`);
  console.log(`Unmatched (venue=null):${unmatched}`);
  console.log(`Upserted rows:         ${upserted}`);
  console.log(`Poster URLs updated:   ${posterUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
