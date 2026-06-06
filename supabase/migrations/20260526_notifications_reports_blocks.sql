-- notifications inbox
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx on notifications(user_id, created_at desc);

alter table notifications enable row level security;

create policy "Users can read own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on notifications for update
  using (auth.uid() = user_id);

create policy "Service role can insert notifications"
  on notifications for insert
  with check (true);

-- user reports
create table if not exists user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table user_reports enable row level security;

create policy "Users can insert reports"
  on user_reports for insert
  with check (auth.uid() = reporter_id);

-- user blocks
create table if not exists user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_id, blocked_id)
);

alter table user_blocks enable row level security;

create policy "Users can manage own blocks"
  on user_blocks for all
  using (auth.uid() = blocker_id);
