-- Happy Hour Deals
create table if not exists happy_hours (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  title text not null,
  description text,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time time not null,
  end_time time not null,
  deal_details text,
  created_at timestamptz default now()
);

alter table happy_hours enable row level security;

-- Anyone can read all happy hour deals
create policy "happy_hours_select"
  on happy_hours for select
  using (true);

-- Business accounts can insert deals for their own venue
create policy "happy_hours_insert"
  on happy_hours for insert
  with check (
    venue_id in (
      select venue_id from profiles
      where id = auth.uid()
        and account_type = 'business'
        and venue_id is not null
    )
  );

-- Business accounts can update their own venue's deals
create policy "happy_hours_update"
  on happy_hours for update
  using (
    venue_id in (
      select venue_id from profiles
      where id = auth.uid()
        and account_type = 'business'
        and venue_id is not null
    )
  );

-- Business accounts can delete their own venue's deals
create policy "happy_hours_delete"
  on happy_hours for delete
  using (
    venue_id in (
      select venue_id from profiles
      where id = auth.uid()
        and account_type = 'business'
        and venue_id is not null
    )
  );

-- Index for fast lookup by venue
create index if not exists happy_hours_venue_idx on happy_hours(venue_id);
-- Index for fast lookup by day
create index if not exists happy_hours_day_idx on happy_hours(day_of_week);
