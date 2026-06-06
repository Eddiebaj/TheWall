-- Migration: delete_my_account RPC
-- Deletes all data for the calling authenticated user, then removes their auth record.
-- Uses SECURITY DEFINER so it can delete across all tables.

create or replace function delete_my_account()
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

  -- Remove tokens and activity
  delete from push_tokens where user_id = uid;
  delete from venue_event_rsvps where user_id = uid;
  delete from event_rsvps where user_id = uid;
  delete from saved_events where user_id = uid;
  delete from checkins where user_id = uid;
  delete from pending_plans where creator_id = uid;

  -- Remove messaging
  delete from message_reads where user_id = uid;
  delete from messages where sender_id = uid;
  delete from conversation_members where user_id = uid;

  -- Remove social graph and moderation
  delete from notifications where user_id = uid;
  delete from user_reports where reporter_id = uid;
  delete from user_blocks where blocker_id = uid or blocked_id = uid;
  delete from friendships where requester_id = uid or addressee_id = uid;

  -- Remove content
  delete from posts where user_id = uid;
  delete from venue_events where creator_id = uid;
  delete from event_interests where user_id = uid;

  -- Remove profile last (FK target)
  delete from profiles where id = uid;

  -- Delete the auth user
  delete from auth.users where id = uid;
end;
$$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
