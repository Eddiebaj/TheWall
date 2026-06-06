-- Add event_id to hangouts so share cards can look up hangouts by event instead of event_name string match
alter table public.hangouts
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists hangouts_event_id_idx on public.hangouts(event_id);
