create table social_feedback (
  id uuid default gen_random_uuid() primary key,
  venue_name text not null,
  suggestion text not null,
  created_at timestamptz default now()
);

create index on social_feedback (created_at desc);
