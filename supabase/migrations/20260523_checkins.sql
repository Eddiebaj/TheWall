-- Venue check-ins
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz
);

create index if not exists checkins_venue_id_idx on checkins(venue_id);
create index if not exists checkins_user_id_idx on checkins(user_id);
create index if not exists checkins_active_idx on checkins(venue_id, checked_in_at) where checked_out_at is null;

alter table checkins enable row level security;

-- Users can read all active check-ins (for showing who's at a venue)
create policy "read checkins" on checkins
  for select using (true);

-- Users can insert their own check-ins
create policy "insert own checkin" on checkins
  for insert with check (auth.uid() = user_id);

-- Users can update their own check-ins (to check out)
create policy "update own checkin" on checkins
  for update using (auth.uid() = user_id);

-- Auto-expire function: mark check-ins older than 4 hours as checked out
create or replace function expire_old_checkins() returns void
language plpgsql security definer as $$
begin
  update checkins
  set checked_out_at = now()
  where checked_out_at is null
    and checked_in_at < now() - interval '4 hours';
end;
$$;
