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

// ── Geocoding helper (Nominatim / OpenStreetMap) ──────────────────────────────

interface GeoResult {
  lat: number;
  lng: number;
}

async function geocode(address: string): Promise<GeoResult | null> {
  const query = `${address}, Toronto, Ontario, Canada`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'affiche-geocoder/1.0' },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data?.length) return null;

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching venues with null coordinates…');

  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address')
    .not('address', 'is', null)
    .is('latitude', null);

  if (error) {
    console.error('Failed to load venues:', error.message);
    process.exit(1);
  }

  console.log(`Found ${venues!.length} venues to geocode (~${Math.ceil(venues!.length * 1.1)}s)\n`);

  let geocoded = 0;
  let failed = 0;

  for (const venue of venues!) {
    try {
      const result = await geocode(venue.address!);

      if (!result) {
        console.log(`ZERO_RESULTS  ${venue.name} — "${venue.address}"`);
        failed++;
      } else {
        const { error: updateErr } = await supabase
          .from('venues')
          .update({ latitude: result.lat, longitude: result.lng })
          .eq('id', venue.id);

        if (updateErr) {
          console.log(`FAILED (db)   ${venue.name} — ${updateErr.message}`);
          failed++;
        } else {
          console.log(`OK  ${venue.name} → ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`);
          geocoded++;
        }
      }
    } catch (err: any) {
      console.log(`FAILED (api)  ${venue.name} — ${err.message}`);
      failed++;
    }

    // Nominatim policy: max 1 req/sec — 1100ms to be safe
    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log('');
  console.log(`Summary: ${geocoded} geocoded, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
