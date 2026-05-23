-- Add Ticketmaster sync columns to venue_events
alter table public.venue_events
  alter column business_id drop not null;

alter table public.venue_events
  add column if not exists venue_id     uuid references public.venues(id) on delete set null,
  add column if not exists description  text,
  add column if not exists end_time     text,
  add column if not exists ticket_url   text,
  add column if not exists entry_type   text default 'Free',
  add column if not exists external_id  text unique,
  add column if not exists source       text default 'manual';

create index if not exists idx_venue_events_venue_id    on public.venue_events (venue_id);
create index if not exists idx_venue_events_external_id on public.venue_events (external_id);
