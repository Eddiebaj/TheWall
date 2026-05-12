-- Stop safety reports: rider-submitted "feel unsafe here" signals
-- INSERT-only for anon (app); aggregation via service role (backend)

CREATE TABLE IF NOT EXISTS stop_safety_reports (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stop_id    text NOT NULL,
  stop_code  text NOT NULL,
  device_id  text NOT NULL,
  time_of_day text NOT NULL CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stop_safety_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon_insert_safety" ON stop_safety_reports
    FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_select_safety" ON stop_safety_reports
    FOR SELECT TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_stop_safety_stop_id ON stop_safety_reports(stop_id, created_at DESC);
