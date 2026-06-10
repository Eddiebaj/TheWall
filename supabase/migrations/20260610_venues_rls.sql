-- Enable RLS on venues
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can read venues
CREATE POLICY "venues_select_public"
  ON venues
  FOR SELECT
  USING (true);

-- Authenticated update: only users linked to the venue via business_profiles
CREATE POLICY "venues_update_owner"
  ON venues
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT bp.user_id
      FROM business_profiles bp
      WHERE bp.venue_id = venues.id
    )
  );
