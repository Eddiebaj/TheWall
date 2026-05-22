-- Tracks users who marked an event as "Interested" (separate from going RSVP)
CREATE TABLE IF NOT EXISTS event_interests (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   text        NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_interests_event_id ON event_interests (event_id);
CREATE INDEX IF NOT EXISTS idx_event_interests_user_id  ON event_interests (user_id);

ALTER TABLE event_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read"  ON event_interests FOR SELECT USING (true);
CREATE POLICY "insert_own"   ON event_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own"   ON event_interests FOR DELETE USING (auth.uid() = user_id);
