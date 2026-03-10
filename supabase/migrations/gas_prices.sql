create table gas_prices (
  id uuid default gen_random_uuid() primary key,
  station_name text not null,
  address text,
  lat double precision,
  lng double precision,
  price_per_litre numeric(4,3) not null,
  fuel_type text default 'regular' check (fuel_type in ('regular', 'premium', 'diesel')),
  reported_at timestamptz default now(),
  confirmed_count integer default 0,
  disputed_count integer default 0
);

create index on gas_prices (reported_at desc);
