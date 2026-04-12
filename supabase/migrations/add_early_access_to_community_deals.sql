-- Add early_access flag to community_deals.
-- Premium users see early_access=true deals; free users only see early_access=false (or null).
ALTER TABLE community_deals
  ADD COLUMN IF NOT EXISTS early_access boolean DEFAULT false;
