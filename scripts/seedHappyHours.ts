import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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

interface HappyHourSpec {
  venueName: string;
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string; // HH:MM 24h
  endTime: string;
  dealName: string;
  dealDescription: string;
}

const specs: HappyHourSpec[] = [
  {
    venueName: 'Rebel',
    days: [1, 2, 3, 4, 5],
    startTime: '16:00',
    endTime: '19:00',
    dealName: 'Happy Hour',
    dealDescription: '$6 domestics, $8 cocktails',
  },
  {
    venueName: 'CODA',
    days: [4, 5, 6],
    startTime: '21:00',
    endTime: '23:00',
    dealName: 'Early Night Special',
    dealDescription: '$5 shots, $7 beers',
  },
  {
    venueName: 'Adelaide Hall',
    days: [3, 4, 5],
    startTime: '17:00',
    endTime: '20:00',
    dealName: 'After Work',
    dealDescription: '$7 house wine, $6 draft',
  },
  {
    venueName: 'The Horseshoe Tavern',
    days: [1, 2, 3, 4],
    startTime: '16:00',
    endTime: '19:00',
    dealName: 'Happy Hour',
    dealDescription: '$5 drafts, $6 house spirits',
  },
  {
    venueName: 'The Drake Hotel',
    days: [0, 1, 2, 3, 4, 5, 6],
    startTime: '15:00',
    endTime: '18:00',
    dealName: 'Drake Happy Hour',
    dealDescription: '$8 cocktails, $6 wine',
  },
  {
    venueName: 'Bar Hop',
    days: [1, 2, 3, 4, 5],
    startTime: '15:00',
    endTime: '19:00',
    dealName: 'Hop Hour',
    dealDescription: '$5 draft, 2-for-1 appetizers',
  },
  {
    venueName: 'Lavelle',
    days: [5],
    startTime: '17:00',
    endTime: '20:00',
    dealName: 'Rooftop Happy Hour',
    dealDescription: '$9 cocktails, free appetizers',
  },
];

async function main() {
  const venueNames = specs.map((s) => s.venueName);

  console.log(`\nLooking up ${venueNames.length} venues...`);

  const { data: venues, error: venueError } = await supabase
    .from('venues')
    .select('id, name')
    .in('name', venueNames);

  if (venueError) {
    console.error('Error fetching venues:', venueError.message);
    process.exit(1);
  }

  const venueMap = new Map<string, string>((venues ?? []).map((v) => [v.name, v.id]));

  console.log(`\nVenue lookup results:`);
  for (const name of venueNames) {
    if (venueMap.has(name)) {
      console.log(`  [FOUND]   ${name} (id: ${venueMap.get(name)})`);
    } else {
      console.log(`  [MISSING] ${name}`);
    }
  }

  const rows: object[] = [];

  for (const spec of specs) {
    const venueId = venueMap.get(spec.venueName);
    if (!venueId) continue;

    for (const day of spec.days) {
      rows.push({
        venue_id: venueId,
        day_of_week: day,
        start_time: spec.startTime,
        end_time: spec.endTime,
        title: spec.dealName,
        deal_details: spec.dealDescription,
      });
    }
  }

  if (rows.length === 0) {
    console.log('\nNo matching venues found — nothing to insert.');
    process.exit(0);
  }

  console.log(`\nInserting ${rows.length} happy hour deal rows...`);

  const { error: insertError } = await supabase.from('happy_hours').insert(rows);

  if (insertError) {
    console.error('Insert error:', insertError.message);
    process.exit(1);
  }

  console.log(`\nDone. Inserted ${rows.length} deals across ${venueMap.size} venue(s).`);
}

main();
