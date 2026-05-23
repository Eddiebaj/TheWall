-- Add business fields to profiles
alter table public.profiles
  add column if not exists is_business boolean not null default false,
  add column if not exists business_email text,
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

-- Add business_email to business_subscriptions for email-based lookup
alter table public.business_subscriptions
  add column if not exists business_email text;

-- Venue views table for analytics
create table if not exists public.venue_views (
  id         uuid        default gen_random_uuid() primary key,
  venue_id   uuid        not null references public.venues(id) on delete cascade,
  user_id    uuid        references public.profiles(id) on delete set null,
  viewed_at  timestamptz not null default now()
);

create index if not exists idx_venue_views_venue_id on public.venue_views (venue_id);
create index if not exists idx_venue_views_viewed_at on public.venue_views (viewed_at);

alter table public.venue_views enable row level security;

create policy "Public can insert venue views"
  on public.venue_views for insert to authenticated
  with check (true);

create policy "Business owner can read venue views"
  on public.venue_views for select to authenticated
  using (
    venue_id in (
      select venue_id from public.profiles where id = auth.uid() and is_business = true
    )
  );

-- Allow users to read their own profile business fields
create policy "Users can update own profile business fields"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
