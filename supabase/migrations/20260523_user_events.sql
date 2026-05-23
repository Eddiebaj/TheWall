-- Add user event fields to venue_events
alter table public.venue_events
  add column if not exists creator_id   uuid references auth.users(id) on delete set null,
  add column if not exists recurrence   text default 'once',
  add column if not exists max_attendees integer,
  add column if not exists visibility   text default 'public',
  add column if not exists category     text;

-- Allow authenticated users to insert their own events
create policy "Users can create own events"
  on public.venue_events for insert to authenticated
  with check (
    creator_id = auth.uid()
    or business_id in (
      select id from public.business_profiles where user_id = auth.uid()
    )
  );

-- Allow users to update their own events
create policy "Users can update own events"
  on public.venue_events for update to authenticated
  using (creator_id = auth.uid());

-- Storage bucket for event cover images
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy "Anyone can read event images"
  on storage.objects for select
  using (bucket_id = 'event-images');

create policy "Authenticated users can upload event images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images');
