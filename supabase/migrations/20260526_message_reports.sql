create table if not exists message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  conversation_id uuid not null,
  reason text not null default 'user_report',
  created_at timestamptz not null default now()
);

alter table message_reports enable row level security;

create policy "Users can insert their own reports"
  on message_reports for insert
  with check (auth.uid() = reporter_id);
