-- Route reliability data collection table
-- Populated by GitHub Actions cron every 5 minutes
-- Consumed by arrivals API and planner for on-time performance stats

CREATE TABLE IF NOT EXISTS route_reliability (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  trip_id TEXT,
  scheduled_time TEXT,            -- GTFS format HH:MM:SS
  delta_minutes REAL NOT NULL,    -- predicted - scheduled, in minutes (positive = late)
  on_time BOOLEAN DEFAULT TRUE,   -- within 3 minutes of scheduled
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for upsert deduplication: one record per route+stop+trip per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_reliability_dedup
  ON route_reliability (route_id, stop_id, trip_id, recorded_date);

-- Index for the common query pattern: last 30 days for a specific stop
CREATE INDEX IF NOT EXISTS idx_reliability_stop_date
  ON route_reliability (stop_id, created_at DESC);

-- Index for route-only queries (used by planner)
CREATE INDEX IF NOT EXISTS idx_reliability_route
  ON route_reliability (route_id);

-- Auto-cleanup: drop records older than 90 days to keep table size manageable
-- Run this manually or via a separate scheduled job:
-- DELETE FROM route_reliability WHERE recorded_date < CURRENT_DATE - INTERVAL '90 days';
