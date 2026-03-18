-- RouteO Phase 0: Create 5 new Supabase tables
-- Run this in the Supabase SQL Editor

-- ── 1. Push tokens ──────────────────────────────────────────────────
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_token TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'ios',
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can upsert their own token" ON push_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Push subscriptions ───────────────────────────────────────────
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_id, type)
);

CREATE INDEX idx_push_subs_device ON push_subscriptions (device_id, type);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage their subs" ON push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Stop reports ─────────────────────────────────────────────────
CREATE TABLE stop_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bench_broken', 'shelter_missing', 'accessibility', 'cleanliness', 'schedule_missing', 'other')),
  description TEXT DEFAULT '',
  device_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stop_reports_stop ON stop_reports (stop_id, created_at DESC);

ALTER TABLE stop_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can submit reports
CREATE POLICY "Anyone can submit reports" ON stop_reports
  FOR INSERT WITH CHECK (true);

-- Anyone can read reports
CREATE POLICY "Anyone can read reports" ON stop_reports
  FOR SELECT USING (true);

-- ── 4. Trip history ─────────────────────────────────────────────────
CREATE TABLE trip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  from_label TEXT NOT NULL,
  from_lat DOUBLE PRECISION NOT NULL,
  from_lng DOUBLE PRECISION NOT NULL,
  to_label TEXT NOT NULL,
  to_lat DOUBLE PRECISION NOT NULL,
  to_lng DOUBLE PRECISION NOT NULL,
  mode TEXT DEFAULT 'TRANSIT',
  duration_mins INTEGER,
  planned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trip_history_device ON trip_history (device_id, planned_at DESC);

ALTER TABLE trip_history ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their own trips
CREATE POLICY "Anyone can save trips" ON trip_history
  FOR INSERT WITH CHECK (true);

-- Anyone can read their own trips (device_id match is enforced client-side)
CREATE POLICY "Anyone can read trips" ON trip_history
  FOR SELECT USING (true);

-- ── 5. Neighbourhood transit scores ─────────────────────────────────
CREATE TABLE neighbourhood_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neighbourhood_id TEXT NOT NULL UNIQUE,
  stop_count_500m INTEGER DEFAULT 0,
  route_count INTEGER DEFAULT 0,
  avg_frequency_min DOUBLE PRECISION DEFAULT 0,
  transit_score DOUBLE PRECISION DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neighbourhood_scores ENABLE ROW LEVEL SECURITY;

-- Anyone can read scores
CREATE POLICY "Read scores" ON neighbourhood_scores
  FOR SELECT USING (true);

-- Only backend (service role) inserts/updates — use service role key in cron-refresh.js
-- For now, allow all to enable initial seeding
CREATE POLICY "Backend can upsert scores" ON neighbourhood_scores
  FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Bug reports ────────────────────────────────────────────────
CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  screen TEXT,
  device_id TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit bug reports" ON bug_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read bug reports" ON bug_reports
  FOR SELECT USING (true);
