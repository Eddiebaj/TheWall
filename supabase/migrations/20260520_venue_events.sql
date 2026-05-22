-- Venue-owned events (created by business owners in the dashboard)
create table if not exists public.venue_events (
  id           uuid        default gen_random_uuid() primary key,
  business_id  uuid        not null references public.business_profiles(id) on delete cascade,
  title        text        not null,
  event_date   date        not null,
  event_time   text,
  cover_charge text        default 'Free',
  poster_url   text,
  created_at   timestamptz default now()
);

create index if not exists idx_venue_events_business_id on public.venue_events (business_id);

-- RSVPs for venue_events
create table if not exists public.venue_event_rsvps (
  id         uuid        default gen_random_uuid() primary key,
  event_id   uuid        not null references public.venue_events(id) on delete cascade,
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  status     text        not null check (status in ('going', 'interested')),
  created_at timestamptz default now(),
  unique (event_id, user_id)
);

create index if not exists idx_venue_event_rsvps_event_id on public.venue_event_rsvps (event_id);

-- Add event_id to city_board_posts so moments can be tied to an event
alter table public.city_board_posts
  add column if not exists event_id uuid references public.venue_events(id) on delete set null;

-- RLS
alter table public.venue_events enable row level security;
alter table public.venue_event_rsvps enable row level security;

create policy "Public can read venue events"
  on public.venue_events for select using (true);

create policy "Business owner can insert events"
  on public.venue_events for insert to authenticated
  with check (
    business_id in (
      select id from public.business_profiles where user_id = auth.uid()
    )
  );

create policy "Business owner can update events"
  on public.venue_events for update to authenticated
  using (
    business_id in (
      select id from public.business_profiles where user_id = auth.uid()
    )
  );

create policy "Public can read event rsvps"
  on public.venue_event_rsvps for select using (true);

create policy "Authenticated users can rsvp"
  on public.venue_event_rsvps for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own rsvp"
  on public.venue_event_rsvps for update to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own rsvp"
  on public.venue_event_rsvps for delete to authenticated
  using (auth.uid() = user_id);
