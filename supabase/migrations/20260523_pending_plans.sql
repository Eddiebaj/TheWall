-- Group planning ("Let's go?")
create table if not exists pending_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  event_id text not null,
  event_title text not null,
  event_venue text,
  event_date text,
  invited_user_ids uuid[] not null default '{}',
  responses jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists pending_plans_creator_idx on pending_plans(creator_id);
create index if not exists pending_plans_event_idx on pending_plans(event_id);

alter table pending_plans enable row level security;

-- Creators can read/insert/update their own plans
create policy "creator access" on pending_plans
  for all using (auth.uid() = creator_id);

-- Invited users can read plans they are invited to
create policy "invited read" on pending_plans
  for select using (auth.uid() = any(invited_user_ids));

-- Invited users can update (respond) to plans they are invited to
create policy "invited update" on pending_plans
  for update using (auth.uid() = any(invited_user_ids));
