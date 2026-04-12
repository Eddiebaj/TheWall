-- Business membership table for B2B partner deals.
-- Businesses pay via Stripe (outside App Store). On subscription activation,
-- the Stripe webhook sets stripe_customer_id and is_active=true.
-- On onboarding, Claude moderates the deal description and sets is_active.
CREATE TABLE IF NOT EXISTS business_members (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email                text        UNIQUE NOT NULL,
  business_name        text,
  deal_title           text,
  deal_description     text,
  photo_url            text,
  lat                  double precision,
  lng                  double precision,
  address              text,
  category             text,
  radius_meters        integer     DEFAULT 500,
  is_active            boolean     DEFAULT false,
  is_onboarded         boolean     DEFAULT false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- One-time token generated on register, sent via onboarding email, cleared after first onboard.
  -- Never returned in HTTP responses — only transmitted via email.
  onboarding_token       text,
  created_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_members_email         ON business_members (email);
CREATE INDEX IF NOT EXISTS idx_business_members_active        ON business_members (is_active, is_onboarded);
CREATE INDEX IF NOT EXISTS idx_business_members_stripe_cust   ON business_members (stripe_customer_id);

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- Public read for active, onboarded partner deals only
CREATE POLICY "public_read_active"
  ON business_members FOR SELECT
  USING (is_active = true AND is_onboarded = true);

-- Backend service key (bypasses RLS) handles INSERT/UPDATE via supabase service role.
