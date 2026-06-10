-- Allow a venue owner to claim an external (e.g. Ticketmaster) event
-- that is matched to their venue but not yet associated with a business.
--
-- USING      : the event's venue_id belongs to one of the caller's venues
-- WITH CHECK : after update, venue_id must still be in the caller's venues
--              AND business_id must be one of the caller's business profiles
create policy "Venue owner can claim events"
  on public.venue_events for update to authenticated
  using (
    venue_id in (
      select v.id
      from public.venues v
      join public.business_profiles bp on bp.venue_id = v.id
      where bp.user_id = auth.uid()
    )
  )
  with check (
    venue_id in (
      select v.id
      from public.venues v
      join public.business_profiles bp on bp.venue_id = v.id
      where bp.user_id = auth.uid()
    )
    and
    business_id in (
      select id
      from public.business_profiles
      where user_id = auth.uid()
    )
  );
