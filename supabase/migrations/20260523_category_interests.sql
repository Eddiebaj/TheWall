-- Add interests to profiles for onboarding personalization
alter table public.profiles
  add column if not exists interests text[];

-- Add category to venue_events (Ticketmaster sync)
alter table public.venue_events
  add column if not exists category text;

-- Add category to events (business-owner events)
alter table public.events
  add column if not exists category text;

create index if not exists idx_venue_events_category on public.venue_events (category);
create index if not exists idx_events_category on public.events (category);
