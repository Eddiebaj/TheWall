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

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── Types ────────────────────────────────────────────────────────────────────

interface MeetupVenue {
  name?: string;
  address?: string;
}

interface MeetupEvent {
  id: string;
  title?: string;
  dateTime?: string;
  description?: string;
  eventUrl?: string;
  going?: { totalCount?: number };
  venue?: MeetupVenue;
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

function matchVenue(meetupVenue: MeetupVenue, dbVenues: DbVenue[]): DbVenue | null {
  if (!meetupVenue.name) return null;

  const mName = normalize(meetupVenue.name);
  const mAddr = normalize(meetupVenue.address ?? '');

  // 1. Exact name match
  const exact = dbVenues.find((v) => normalize(v.name) === mName);
  if (exact) return exact;

  // 2. Partial name match (one contains the other)
  const partial = dbVenues.find((v) => {
    const dbName = normalize(v.name);
    return mName.includes(dbName) || dbName.includes(mName);
  });
  if (partial) return partial;

  // 3. Address match
  if (mAddr.length > 4) {
    const byAddr = dbVenues.find((v) => {
      const dbAddr = normalize(v.address ?? '');
      return dbAddr.length > 4 && (mAddr.includes(dbAddr) || dbAddr.includes(mAddr));
    });
    if (byAddr) return byAddr;
  }

  return null;
}

// ── Fetch from Meetup ────────────────────────────────────────────────────────

async function fetchMeetupEvents(): Promise<MeetupEvent[]> {
  const now = new Date();
  const startDateRange = now.toISOString();
  const seriesStartDate = now.toISOString().split('T')[0];

  const payload = {
    operationName: 'recommendedEventsWithSeries',
    variables: {
      first: 200,
      lat: 43.6532,
      lon: -79.3832,
      startDateRange,
      eventType: 'PHYSICAL',
      numberOfEventsForSeries: 5,
      seriesStartDate,
      sortField: 'DATETIME',
      doConsolidateEvents: true,
      doPromotePaypalEvents: false,
      dataConfiguration: '{"isSimplifiedSearchEnabled": true}',
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: 'cf6348a7edb376af58158519e78130eb8beced0aaaed60ab379e82f25fd52eea',
      },
    },
  };

  const res = await fetch('https://www.meetup.com/gql2', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Meetup API error: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  const edges: { node?: { result?: MeetupEvent } }[] =
    data?.data?.keywordSearch?.edges ?? [];

  return edges
    .map((e) => e?.node?.result)
    .filter((e): e is MeetupEvent => !!e && !!e.id);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching venues from Supabase...');
  const { data: dbVenues, error: venuesErr } = await supabase
    .from('venues')
    .select('id, name, address');

  if (venuesErr) {
    console.error('Failed to load venues:', venuesErr.message);
    process.exit(1);
  }

  console.log(`Loaded ${dbVenues!.length} venues`);

  console.log('Fetching events from Meetup (Toronto)...');
  const meetupEvents = await fetchMeetupEvents();
  console.log(`Fetched ${meetupEvents.length} events`);

  let matched = 0;
  let unmatched = 0;
  let upserted = 0;

  const rows = meetupEvents
    .map((event) => {
      let venueId: string | null = null;

      if (event.venue) {
        const match = matchVenue(event.venue, dbVenues!);
        if (match) {
          venueId = match.id;
          matched++;
        } else {
          unmatched++;
        }
      } else {
        unmatched++;
      }

      if (!event.dateTime) return null;

      const dt = new Date(event.dateTime);
      const eventDate = dt.toISOString().split('T')[0];
      const eventTime = dt.toTimeString().split(' ')[0]; // HH:MM:SS

      return {
        external_id: event.id,
        title: event.title ?? 'Untitled',
        venue_id: venueId,
        event_date: eventDate,
        event_time: eventTime,
        end_time: null,
        description: event.description ?? null,
        poster_url: null,
        ticket_url: event.eventUrl ?? null,
        entry_type: 'Free',
        source: 'meetup',
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
  console.log(`Events fetched:         ${meetupEvents.length}`);
  console.log(`Matched to venues:      ${matched}`);
  console.log(`Unmatched (venue=null): ${unmatched}`);
  console.log(`Upserted rows:          ${upserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
