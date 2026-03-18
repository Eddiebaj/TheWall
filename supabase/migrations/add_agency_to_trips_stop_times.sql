-- Add agency column to trips and stop_times so OC/STO data can coexist
-- Run this BEFORE seeding STO GTFS data

-- trips: add agency column, default 'OC' for existing rows
ALTER TABLE trips ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT 'OC';
UPDATE trips SET agency = 'OC' WHERE agency IS NULL;

-- stop_times: add agency column, default 'OC' for existing rows
ALTER TABLE stop_times ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT 'OC';
UPDATE stop_times SET agency = 'OC' WHERE agency IS NULL;

-- Update truncate RPCs to be agency-aware (delete only OC by default)
CREATE OR REPLACE FUNCTION truncate_stop_times() RETURNS void AS $$
BEGIN
  DELETE FROM stop_times WHERE agency = 'OC';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION truncate_trips() RETURNS void AS $$
BEGIN
  DELETE FROM trips WHERE agency = 'OC';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for faster agency-filtered deletes
CREATE INDEX IF NOT EXISTS idx_trips_agency ON trips(agency);
CREATE INDEX IF NOT EXISTS idx_stop_times_agency ON stop_times(agency);
