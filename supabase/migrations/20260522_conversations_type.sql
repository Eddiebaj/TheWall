-- Add type column to conversations (direct vs group)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'direct';

-- Backfill: any existing rows default to 'direct'
UPDATE public.conversations
  SET type = 'direct'
  WHERE type IS NULL;
