-- Create organizer_requests table
create table if not exists public.organizer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.organizer_requests enable row level security;
-- user can insert/read own requests
create policy "own_insert" on public.organizer_requests for insert with check (auth.uid() = user_id);
create policy "own_select" on public.organizer_requests for select using (auth.uid() = user_id);
