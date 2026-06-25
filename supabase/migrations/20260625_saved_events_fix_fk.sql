-- saved_events.event_id incorrectly referenced events(id) only.
-- Feed events can come from either 'events' or 'venue_events', so drop the FK
-- constraint entirely and treat event_id as a plain UUID reference.

ALTER TABLE saved_events DROP CONSTRAINT IF EXISTS saved_events_event_id_fkey;
