-- Event RSVP table: tracks who's going to events from Ticketmaster / Eventbrite / Happy Hour.
-- user_id is the anonymous device ID (no auth required).
CREATE TABLE IF NOT EXISTS event_rsvps (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id    text        NOT NULL,
  event_source text       NOT NULL CHECK (event_source IN ('ticketmaster', 'eventbrite', 'happyhour')),
  user_id     text        NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id  ON event_rsvps (user_id);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read"   ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "insert_own"    ON event_rsvps FOR INSERT WITH CHECK (true);
CREATE POLICY "delete_own"    ON event_rsvps FOR DELETE USING (true);
