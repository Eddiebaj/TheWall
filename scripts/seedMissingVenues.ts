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

const venues = [
  { name: 'Casa Loma', address: '1 Austin Terrace', category: 'Entertainment' },
  { name: 'Rogers Centre', address: '1 Blue Jays Way', category: 'Sports' },
  { name: 'Under the Big Top - Toronto', address: '2150 Lake Shore Blvd', category: 'Entertainment' },
  { name: 'Scotiabank Arena', address: '50 Bay Street', category: 'Sports' },
  { name: 'RBC Amphitheatre', address: '909 Lakeshore Blvd W', category: 'Music' },
  { name: 'The Mod Club', address: '722 College St', category: 'Nightlife' },
  { name: 'Ed Mirvish Theatre', address: '244 Victoria Street', category: 'Theatre' },
  { name: 'The Danforth Music Hall', address: '147 Danforth Ave', category: 'Music' },
  { name: 'Japanese Canadian Cultural Centre', address: '6 Sakura Way', category: 'Culture' },
  { name: 'Fort York & The Bentway', address: '250 Fort York Blvd', category: 'Outdoor' },
  { name: 'Sobeys Stadium', address: '1 Shoreham Drive', category: 'Sports' },
  { name: 'The Opera House', address: '735 Queen St E', category: 'Music' },
  { name: 'The Elgin & Winter Garden Theatres', address: '189 Yonge St', category: 'Theatre' },
  { name: 'The Dance Cave', address: '529 Bloor Street West', category: 'Nightlife' },
  { name: 'Coca-Cola Coliseum', address: '45 Manitoba Drive', category: 'Sports' },
  { name: 'Rogers Stadium', address: '105 Carl Hall Road', category: 'Music' },
  { name: 'Meridian Arts Centre', address: '5040 Yonge Street', category: 'Theatre' },
  { name: 'Rockpile Rock Bar', address: '5555A Dundas St West', category: 'Nightlife' },
  { name: 'Massey Hall', address: '178 Victoria Street', category: 'Music' },
  { name: 'Meridian Hall', address: '1 Front Street East', category: 'Theatre' },
  { name: 'The Phoenix Concert Theatre', address: '410 Sherbourne Street', category: 'Music' },
  { name: 'Woodbine Racetrack', address: '555 Rexdale Blvd', category: 'Entertainment' },
  { name: 'BMO Field', address: '170 Princes Blvd', category: 'Sports' },
  { name: 'Cherry Beach', address: '1 Cherry St', category: 'Outdoor' },
  { name: 'Hard Luck Bar', address: '772a Dundas Street West', category: 'Nightlife' },
  { name: 'The Concert Hall', address: '888 Yonge Street', category: 'Music' },
  { name: 'Harbourfront Centre', address: '235 Queens Quay West', category: 'Culture' },
  { name: 'The Sound Garage', address: '165 Geary Ave', category: 'Music' },
  { name: 'Evergreen Brickworks', address: '550 Bayview Ave', category: 'Outdoor' },
  { name: 'Queen Elizabeth Theatre', address: '190 Princes Blvd', category: 'Entertainment' },
];

async function main() {
  // Fetch existing venue names
  const { data: existing, error: fetchErr } = await supabase
    .from('venues')
    .select('name');

  if (fetchErr) {
    console.error('Failed to fetch existing venues:', fetchErr.message);
    process.exit(1);
  }

  const existingNames = new Set((existing ?? []).map((v: { name: string }) => v.name.toLowerCase()));

  const toInsert = venues.filter(v => !existingNames.has(v.name.toLowerCase()));

  if (toInsert.length === 0) {
    console.log('All venues already exist. Nothing to insert.');
    return;
  }

  console.log(`Inserting ${toInsert.length} venues...`);

  const { error: insertErr } = await supabase.from('venues').insert(
    toInsert.map(v => ({
      name: v.name,
      address: v.address,
      venue_type: v.category,
    }))
  );

  if (insertErr) {
    console.error('Insert failed:', insertErr.message);
    process.exit(1);
  }

  console.log(`Inserted ${toInsert.length} venues successfully.`);
  toInsert.forEach(v => console.log(`  + ${v.name}`));
}

main();
