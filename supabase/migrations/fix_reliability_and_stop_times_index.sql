-- Fix delta_minutes column type if it was created as INTEGER instead of REAL
ALTER TABLE route_reliability
  ALTER COLUMN delta_minutes TYPE REAL USING delta_minutes::REAL;

-- Index on stop_times(trip_id) — critical for the reliability pipeline
-- which queries 5M+ rows with trip_id IN (...) batches
CREATE INDEX IF NOT EXISTS idx_stop_times_trip_id ON stop_times (trip_id);
