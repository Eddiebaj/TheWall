-- Migration: delete_user RPC
-- Deletes all data for the calling user, then removes the auth account.
-- Called from the client via supabase.rpc('delete_user').

create or replace function delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Remove social data
  delete from message_reads where user_id = uid;
  delete from messages where sender_id = uid;
  delete from conversation_members where user_id = uid;
  delete from friendships where requester_id = uid or addressee_id = uid;
  delete from event_rsvps where user_id = uid;
  delete from venue_event_rsvps where user_id = uid;
  delete from event_interests where user_id = uid;
  delete from saved_events where user_id = uid;
  delete from push_tokens where user_id = uid;
  delete from checkins where user_id = uid;
  delete from pending_plans where creator_id = uid;
  delete from notifications where user_id = uid;
  delete from user_reports where reporter_id = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from bug_reports where device_id in (
    select value from push_tokens where user_id = uid
  );

  -- Remove profile last (FK target)
  delete from profiles where id = uid;

  -- Delete the auth user
  delete from auth.users where id = uid;
end;
$$;

-- Only the authenticated user can call this on themselves
revoke all on function delete_user() from public;
grant execute on function delete_user() to authenticated;
