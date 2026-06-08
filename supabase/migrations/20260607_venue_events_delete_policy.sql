-- Allow users to delete their own events
create policy "Users can delete own events"
  on public.venue_events for delete to authenticated
  using (creator_id = auth.uid());

-- Allow business owners to delete their venue's events
create policy "Business owner can delete events"
  on public.venue_events for delete to authenticated
  using (
    business_id in (
      select id from public.business_profiles where user_id = auth.uid()
    )
  );
