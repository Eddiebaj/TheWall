-- Add agency column to route_reliability so OC and STO data can coexist
-- Run after route_reliability.sql

ALTER TABLE route_reliability ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT 'OC';
UPDATE route_reliability SET agency = 'OC' WHERE agency IS NULL;

-- Drop the old unique index and recreate with agency included
DROP INDEX IF EXISTS idx_reliability_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reliability_dedup
  ON route_reliability (route_id, stop_id, trip_id, recorded_date, agency);

-- Index for agency + route queries
CREATE INDEX IF NOT EXISTS idx_reliability_agency_route
  ON route_reliability (agency, route_id);
