-- Bring event_rsvps schema in line with app expectations.
-- Original table had event_source NOT NULL and no status column.

-- 1. Add status column if missing
ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'going';

-- 2. Drop the event_source NOT NULL constraint if it exists
-- (alter to allow nulls; we can't drop the column safely without knowing dependents)
ALTER TABLE public.event_rsvps
  ALTER COLUMN event_source DROP NOT NULL;

-- 3. Ensure user_id can hold UUIDs — if the column is text, cast it to uuid.
-- Only do this if the column type is still text (safe to skip if already uuid).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_rsvps'
      AND column_name = 'user_id'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE public.event_rsvps
      ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
  END IF;
END $$;
