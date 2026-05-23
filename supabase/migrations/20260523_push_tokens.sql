-- push_tokens: stores Expo push tokens per user per device
create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

-- RLS
alter table push_tokens enable row level security;

-- Users can read and manage their own tokens
create policy "Users manage own push tokens"
  on push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can read all tokens (for sending notifications from edge functions)
create policy "Service role reads all push tokens"
  on push_tokens
  for select
  using (auth.role() = 'service_role');
