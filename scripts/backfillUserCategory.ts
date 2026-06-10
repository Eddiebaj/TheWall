/**
 * backfillUserCategory.ts
 *
 * Dry-run by default. Pass --apply to write changes.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/backfillUserCategory.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfillUserCategory.ts --apply
 */

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
const DRY_RUN = !process.argv.includes('--apply');

// ── Valid interest strings (must match onboarding TAGS exactly) ───────────────

type Category =
  | 'Concerts'
  | 'Nightlife'
  | 'Bar'
  | 'Comedy'
  | 'Art & Culture'
  | 'Sports'
  | 'Food & Drinks'
  | 'Outdoor'
  | 'Networking';

// ── Venue category → interest mapping ────────────────────────────────────────

const VENUE_CATEGORY_MAP: Record<string, Category> = {
  Nightclub:       'Nightlife',
  Bar:             'Bar',
  'Cocktail Bar':  'Bar',
  Brewery:         'Bar',
  'Live Music':    'Concerts',
  Theatre:         'Art & Culture',
  Culture:         'Art & Culture',
  Entertainment:   'Art & Culture',
  Sports:          'Sports',
  Outdoor:         'Outdoor',
};

// ── Title-keyword override rules (checked in order, first match wins) ─────────

type Rule = { pattern: RegExp; category: Category };

const TITLE_RULES: Rule[] = [
  { pattern: /comedy|stand[\s-]?up|standup|improv|open\s?mic/i,                                                                    category: 'Comedy' },
  { pattern: /\bDJ\b|techno|\bhouse\b|club\s?night|rave|warehouse|after\s?hours|nightclub/i,                                       category: 'Nightlife' },
  { pattern: /dance\s?party|drag|burlesque|kinky|queer|ballroom|vogue|performance|screening|\bfilm\b|gallery|exhibit|poetry|spoken\s?word|art\s?show/i, category: 'Art & Culture' },
  { pattern: /trivia|bingo|wine|tasting|brunch|dinner|\bfood\b/i,                                                                  category: 'Food & Drinks' },
  { pattern: /networking|career|business|startup/i,                                                                                category: 'Networking' },
  { pattern: /\blive\b.*\bband\b|\bband\b.*\blive\b|concert|acoustic|tribute/i,                                                   category: 'Concerts' },
];

function inferCategory(
  title: string,
  venueCategory: string | null,
): { category: Category | null; source: 'title' | 'venue' | 'none' } {
  // 1. Title-keyword override wins (checked first)
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(title)) return { category: rule.category, source: 'title' };
  }

  // 2. Fall back to venue base
  const base: Category | null = venueCategory ? (VENUE_CATEGORY_MAP[venueCategory] ?? null) : null;
  return base ? { category: base, source: 'venue' } : { category: null, source: 'none' };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : 'APPLY'}\n`);

  // Fetch user-sourced events with no category
  const { data: events, error: eventsErr } = await supabase
    .from('venue_events')
    .select('id, title, venue_id')
    .eq('source', 'user')
    .is('category', null);

  if (eventsErr) {
    console.error('Failed to fetch events:', eventsErr.message);
    process.exit(1);
  }

  console.log(`Found ${events!.length} user events with null category\n`);

  // Fetch all venues (id + category)
  const { data: venues, error: venuesErr } = await supabase
    .from('venues')
    .select('id, venue_type');

  if (venuesErr) {
    console.error('Failed to fetch venues:', venuesErr.message);
    process.exit(1);
  }

  const venueMap = new Map<string, string | null>(
    (venues ?? []).map((v) => [v.id, v.venue_type ?? null])
  );

  // Compute assignments
  type Assignment = { id: string; title: string; category: Category; source: 'title' | 'venue' };
  const assignments: Assignment[] = [];
  const nullCount: string[] = [];

  for (const ev of events!) {
    const venueCategory = ev.venue_id ? (venueMap.get(ev.venue_id) ?? null) : null;
    const { category, source } = inferCategory(ev.title, venueCategory);
    if (category && source !== 'none') {
      assignments.push({ id: ev.id, title: ev.title, category, source });
    } else {
      nullCount.push(ev.title);
    }
  }

  // ── Print dry-run report ──────────────────────────────────────────────────

  console.log('── Distribution ─────────────────────────────────────────────');
  const dist = new Map<string, number>();
  for (const a of assignments) {
    dist.set(a.category, (dist.get(a.category) ?? 0) + 1);
  }
  for (const [cat, count] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${cat}`);
  }

  console.log('\n── Nightlife resolved SOLELY from venue base (no title hit) ─');
  const venueOnlyNightlife = assignments
    .filter((a) => a.category === 'Nightlife' && a.source === 'venue')
    .slice(0, 20);
  if (venueOnlyNightlife.length === 0) {
    console.log('  (none)');
  } else {
    for (const a of venueOnlyNightlife) console.log(`  ${a.title}`);
  }

  console.log('\n── Unresolved (will stay null) ──────────────────────────────');
  if (nullCount.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of nullCount) console.log(`  ${t}`);
  }

  console.log(`\nTotal: ${assignments.length} will be updated, ${nullCount.length} left null`);

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run with --apply to write.');
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  console.log('\nApplying updates…');
  let updated = 0;
  let errors = 0;

  for (const a of assignments) {
    const { error } = await supabase
      .from('venue_events')
      .update({ category: a.category })
      .eq('id', a.id);

    if (error) {
      console.error(`  Error updating "${a.title}":`, error.message);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
