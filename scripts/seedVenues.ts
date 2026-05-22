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

interface Venue {
  name: string;
  neighbourhood: string;
  address: string;
}

const venues: Venue[] = [
  { name: 'Adelaide Hall', neighbourhood: 'King West', address: '250 Adelaide St W' },
  { name: 'EFS', neighbourhood: 'King West', address: '278 King St W' },
  { name: 'Lavelle', neighbourhood: 'King West', address: '627 King St W' },
  { name: 'Baro', neighbourhood: 'King West', address: '485 King St W' },
  { name: 'Soho House', neighbourhood: 'King West', address: '192 Adelaide St W' },
  { name: 'Cube', neighbourhood: 'King West', address: '622 King St W' },
  { name: 'Storia', neighbourhood: 'King West', address: '600 King St W' },
  { name: 'Lot 332', neighbourhood: 'King West', address: '332 King St W' },
  { name: 'The One Eighty', neighbourhood: 'King West', address: '55 Mercer St' },
  { name: 'Circa', neighbourhood: 'King West', address: '126 John St' },
  { name: 'Horseshoe Tavern', neighbourhood: 'Queen West', address: '370 Queen St W' },
  { name: 'The Drake Hotel', neighbourhood: 'Queen West', address: '1150 Queen St W' },
  { name: 'The Rivoli', neighbourhood: 'Queen West', address: '334 Queen St W' },
  { name: 'The Gladstone House', neighbourhood: 'Queen West', address: '1214 Queen St W' },
  { name: 'Bar Piquette', neighbourhood: 'Queen West', address: '1109 Queen St W' },
  { name: 'Prohibition', neighbourhood: 'Queen West', address: '1312 Queen St W' },
  { name: "The Communist's Daughter", neighbourhood: 'Queen West', address: '1149 Dundas St W' },
  { name: 'Parts and Labour', neighbourhood: 'Queen West', address: '1566 Queen St W' },
  { name: 'Handlebar', neighbourhood: 'Kensington', address: '159 Augusta Ave' },
  { name: 'Maison Mercer', neighbourhood: 'Entertainment District', address: '15 Mercer St' },
  { name: 'Rebel', neighbourhood: 'Entertainment District', address: '11 Polson St' },
  { name: 'CODA', neighbourhood: 'Entertainment District', address: '794 Bathurst St' },
  { name: 'Toy Box', neighbourhood: 'Entertainment District', address: '73 Peter St' },
  { name: 'Lost and Found', neighbourhood: 'Entertainment District', address: '577 King St W' },
  { name: 'Bar Cathedral', neighbourhood: 'Entertainment District', address: '54 The Esplanade' },
  { name: 'Nest', neighbourhood: 'Entertainment District', address: '330 Adelaide St W' },
  { name: 'Orchid', neighbourhood: 'Entertainment District', address: '503 Adelaide St W' },
  { name: 'Fiction', neighbourhood: 'Entertainment District', address: '265 Richmond St W' },
  { name: 'Uniun', neighbourhood: 'Entertainment District', address: '473 Adelaide St W' },
  { name: 'Everleigh', neighbourhood: 'Entertainment District', address: '2 Bloor St W' },
  { name: 'Cold Tea', neighbourhood: 'Kensington', address: '60 Kensington Ave' },
  { name: 'Thirsty and Miserable', neighbourhood: 'Kensington', address: '197 Baldwin St' },
  { name: 'The Painted Lady', neighbourhood: 'Dundas West', address: '218 Ossington Ave' },
  { name: 'The Emmet Ray', neighbourhood: 'Dundas West', address: '924 College St' },
  { name: '99 Sudbury', neighbourhood: 'West Queen West', address: '99 Sudbury St' },
  { name: 'Wrongbar', neighbourhood: 'West Queen West', address: '1279 Queen St W' },
  { name: 'Smiling Buddha', neighbourhood: 'West Queen West', address: '961 College St' },
  { name: 'The Baby G', neighbourhood: 'West Queen West', address: '1608 Dundas St W' },
  { name: "Sweaty Betty's", neighbourhood: 'West Queen West', address: '13 Ossington Ave' },
  { name: "Lee's Palace", neighbourhood: 'Bloor', address: '529 Bloor St W' },
  { name: 'The Annex Wreck Room', neighbourhood: 'Bloor', address: '794 Bathurst St' },
  { name: 'The Piston', neighbourhood: 'Bloor', address: '937 Bloor St W' },
  { name: 'Bar Volo', neighbourhood: 'Bloor', address: '587 Yonge St' },
  { name: 'The Monarch Tavern', neighbourhood: 'College', address: '12 Clinton St' },
  { name: 'The Stones Place', neighbourhood: 'College', address: '1255 Queen St W' },
  { name: 'El Furniture Warehouse', neighbourhood: 'College', address: '805 King St W' },
  { name: 'Supermarket', neighbourhood: 'Kensington', address: '268 Augusta Ave' },
  { name: 'The Dakota Tavern', neighbourhood: 'Dundas West', address: '249 Ossington Ave' },
  { name: 'The Ossington', neighbourhood: 'Dundas West', address: '61 Ossington Ave' },
  { name: 'Crews and Tangos', neighbourhood: 'Church Wellesley', address: '508 Church St' },
  { name: "Woody's", neighbourhood: 'Church Wellesley', address: '467 Church St' },
  { name: "Statler's", neighbourhood: 'Church Wellesley', address: '487 Church St' },
  { name: 'The Churchmouse and Firkin', neighbourhood: 'Church Wellesley', address: '475 Church St' },
  { name: 'The Barn', neighbourhood: 'Church Wellesley', address: '418 Church St' },
  { name: 'The Distillery Bar', neighbourhood: 'Distillery District', address: '55 Mill St' },
  { name: 'Cluny Bistro', neighbourhood: 'Distillery District', address: '35 Tank House Lane' },
  { name: 'El Catrin', neighbourhood: 'Distillery District', address: '18 Tank House Lane' },
  { name: 'Archeo', neighbourhood: 'Distillery District', address: '31 Trinity St' },
  { name: 'Soma Chocolate', neighbourhood: 'Distillery District', address: '32 Tank House Lane' },
  { name: 'Junction City Music Hall', neighbourhood: 'The Junction', address: '2907 Dundas St W' },
  { name: 'The Hole in the Wall', neighbourhood: 'The Junction', address: '2867 Dundas St W' },
  { name: 'The Crooked Star', neighbourhood: 'The Junction', address: '2934 Dundas St W' },
  { name: 'Axis Bar', neighbourhood: 'The Junction', address: '3048 Dundas St W' },
  { name: 'Cibo Wine Bar', neighbourhood: 'Yorkville', address: '133 Yorkville Ave' },
  { name: "Hemingway's", neighbourhood: 'Yorkville', address: '142 Cumberland St' },
  { name: 'Byblos', neighbourhood: 'King West', address: '11 Duncan St' },
  { name: "Miss Thing's", neighbourhood: 'Kensington', address: '46 Nassau St' },
  { name: 'Bar Hop', neighbourhood: 'Entertainment District', address: '391 King St W' },
  { name: 'The Saint', neighbourhood: 'King West', address: '227 Ossington Ave' },
  { name: "Donna's", neighbourhood: 'King West', address: '550 King St W' },
  { name: 'Bar Isabel', neighbourhood: 'Dundas West', address: '797 College St' },
  { name: 'Bellwoods Brewery', neighbourhood: 'West Queen West', address: '124 Ossington Ave' },
  { name: 'Get Well', neighbourhood: 'Kensington', address: '1181 Dundas St W' },
  { name: 'The Rec Room', neighbourhood: 'Entertainment District', address: '255 Bremner Blvd' },
  { name: 'Spoon and Fork', neighbourhood: 'Queen West', address: '609 Queen St W' },
  { name: 'Tallboys', neighbourhood: 'Bloor', address: '838 Bloor St W' },
  { name: 'The Banknote', neighbourhood: 'Entertainment District', address: '60 Bremner Blvd' },
  { name: 'Brazen Head', neighbourhood: 'Entertainment District', address: '165 Front St E' },
  { name: 'The Reservoir Lounge', neighbourhood: 'Old Town', address: '52 Wellington St E' },
  { name: "C'est What", neighbourhood: 'Old Town', address: '67 Front St E' },
  { name: 'The Rex Hotel', neighbourhood: 'Entertainment District', address: '194 Queen St W' },
  { name: 'Cameron House', neighbourhood: 'Queen West', address: '408 Queen St W' },
  { name: "Sneaky Dee's", neighbourhood: 'College', address: '431 College St' },
  { name: 'Bovine Sex Club', neighbourhood: 'Queen West', address: '542 Queen St W' },
  { name: 'The Ship', neighbourhood: 'Entertainment District', address: '238 Adelaide St W' },
  { name: 'Pravda Vodka Bar', neighbourhood: 'Old Town', address: '44 Wellington St E' },
  { name: 'Lula Lounge', neighbourhood: 'Dundas West', address: '1585 Dundas St W' },
  { name: 'The Orbit Room', neighbourhood: 'College', address: '580 College St' },
  { name: 'Left Field Brewery', neighbourhood: 'Leslieville', address: '36 Wagstaff Dr' },
  { name: 'Eastbound Brewing', neighbourhood: 'Leslieville', address: '895 Queen St E' },
  { name: 'The Only Cafe', neighbourhood: 'Danforth', address: '972 Danforth Ave' },
  { name: 'The Comrade', neighbourhood: 'Leslieville', address: '822 Queen St E' },
  { name: 'Hirut', neighbourhood: 'Danforth', address: '2050 Danforth Ave' },
  { name: 'Crown and Tiger', neighbourhood: 'Danforth', address: '1305 Gerrard St E' },
  { name: 'Spin Gallery', neighbourhood: 'Queen West', address: '1100 Queen St W' },
  { name: 'The Local', neighbourhood: 'Leslieville', address: '396 Roncesvalles Ave' },
  { name: 'Roncy Rocks', neighbourhood: 'Dundas West', address: '375 Roncesvalles Ave' },
  { name: 'The Victory Cafe', neighbourhood: 'Bloor', address: '581 Markham St' },
  { name: 'Bar Poet', neighbourhood: 'College', address: '1012 Queen St W' },
];

async function seed() {
  console.log(`Seeding ${venues.length} venues...`);

  // Fetch existing venue names to skip duplicates
  const { data: existing, error: fetchError } = await supabase
    .from('venues')
    .select('name');

  if (fetchError) {
    console.error('Error fetching existing venues:', fetchError.message);
    process.exit(1);
  }

  const existingNames = new Set((existing ?? []).map((v: { name: string }) => v.name));
  const toInsert = venues.filter((v) => !existingNames.has(v.name));

  if (toInsert.length === 0) {
    console.log('All venues already exist, nothing to insert.');
    return;
  }

  console.log(`Inserting ${toInsert.length} new venues (skipping ${venues.length - toInsert.length} duplicates)...`);

  const { error: insertError } = await supabase.from('venues').insert(toInsert);

  if (insertError) {
    console.error('Error inserting venues:', insertError.message);
    process.exit(1);
  }

  console.log(`Done. Inserted ${toInsert.length} venues.`);
}

seed();
