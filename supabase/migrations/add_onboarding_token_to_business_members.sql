-- Adds the onboarding_token column to business_members.
-- Apply this if create_business_members.sql was already run without the column.
-- The token is generated on business.register, sent via onboarding email, and
-- cleared (set to NULL) after the business successfully completes business.onboard.
ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS onboarding_token text;
