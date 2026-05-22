create table if not exists business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text check (plan in ('basic', 'pro', 'featured')),
  status text check (status in ('active', 'cancelled', 'past_due')) not null default 'active',
  boost_type text check (boost_type in ('3day', '7day', 'weekend')),
  boost_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table business_subscriptions enable row level security;

-- Service role has full access; authenticated users can read their own venue's subscription
create policy "service_role_all" on business_subscriptions
  for all using (auth.role() = 'service_role');
