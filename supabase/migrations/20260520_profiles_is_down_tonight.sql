alter table profiles
  add column if not exists is_down_tonight boolean not null default false;
