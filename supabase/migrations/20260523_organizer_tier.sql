-- Add organizer tier fields to profiles
alter table public.profiles
  add column if not exists is_organizer boolean not null default false,
  add column if not exists organizer_name text;

-- Store organizer name on events for attribution
alter table public.venue_events
  add column if not exists organizer_name text;
