alter table venues
  add column if not exists is_featured boolean not null default false,
  add column if not exists feature_tier text check (feature_tier in ('basic', 'pro', 'featured'));
