-- Phase 4: Auth + Social Schema

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  campus text,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Friendships
create table public.friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  addressee_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique(requester_id, addressee_id)
);

-- Conversations (group chats)
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  name text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Conversation members
create table public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

-- Messages
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null,
  content text,
  type text default 'text' check (type in ('text', 'venue_share', 'event_share', 'rsvp', 'eta')),
  metadata jsonb,
  created_at timestamptz default now()
);

-- Hangouts (who's in?)
create table public.hangouts (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  venue_name text not null,
  venue_lat float,
  venue_lng float,
  event_name text,
  happening_at timestamptz,
  created_at timestamptz default now()
);

-- Hangout RSVPs
create table public.hangout_rsvps (
  hangout_id uuid references public.hangouts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text default 'interested' check (status in ('going', 'interested', 'declined')),
  eta_minutes integer,
  created_at timestamptz default now(),
  primary key (hangout_id, user_id)
);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.hangouts enable row level security;
alter table public.hangout_rsvps enable row level security;

-- Profiles: visible to all authenticated users
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Friendships: users can see their own friendships
create policy "Users can view own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can create friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester_id);

create policy "Users can update friendships they received"
  on public.friendships for update
  to authenticated
  using (auth.uid() = addressee_id);

-- Conversations: members only
create policy "Members can view conversations"
  on public.conversations for select
  to authenticated
  using (
    id in (
      select conversation_id from public.conversation_members
      where user_id = auth.uid()
    )
  );

create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Messages: members only
create policy "Members can view messages"
  on public.messages for select
  to authenticated
  using (
    conversation_id in (
      select conversation_id from public.conversation_members
      where user_id = auth.uid()
    )
  );

create policy "Members can send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id and
    conversation_id in (
      select conversation_id from public.conversation_members
      where user_id = auth.uid()
    )
  );

-- Conversation members
create policy "Members can view conversation members"
  on public.conversation_members for select
  to authenticated
  using (
    conversation_id in (
      select conversation_id from public.conversation_members cm2
      where cm2.user_id = auth.uid()
    )
  );

create policy "Members can add others to conversations"
  on public.conversation_members for insert
  to authenticated
  with check (
    conversation_id in (
      select conversation_id from public.conversation_members
      where user_id = auth.uid()
    )
  );

-- Hangouts and RSVPs follow conversation membership
create policy "Members can view hangouts"
  on public.hangouts for select
  to authenticated
  using (
    conversation_id in (
      select conversation_id from public.conversation_members
      where user_id = auth.uid()
    )
  );

create policy "Members can create hangouts"
  on public.hangouts for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Users can manage own RSVPs"
  on public.hangout_rsvps for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable realtime for messages
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.hangout_rsvps;
