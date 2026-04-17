-- ============================================================
-- Migration: enable_rls_public_tables.sql
-- Date: 2026-04-17
--
-- Enables RLS and adds policies on 8 tables that previously
-- had RLS disabled. Applied manually via Supabase dashboard;
-- this file records the canonical state for version control.
--
-- SERVICE ROLE NOTE: Supabase's service role key bypasses RLS
-- automatically — no explicit service role policies are needed.
-- All backend writes (routeo-backend Vercel functions) use the
-- service role and are unaffected by any policy here.
--
-- Tables already RLS-enabled (not modified):
--   push_tokens, push_subscriptions, stop_reports, trip_history,
--   neighbourhood_scores, bug_reports, business_members, event_rsvps
--
-- sponsored_deals: not found in schema — excluded.
-- crowding_averages: VIEW, not a table — RLS not applicable.
-- ============================================================


-- ── 1. community_deals ───────────────────────────────────────
-- Frontend reads approved deals directly via anon key.
-- All writes (insert + moderation updates) go through
-- /api/community backend (service role).

ALTER TABLE community_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cd_public_read_approved"
  ON community_deals
  FOR SELECT
  USING (approved = true);


-- ── 2. community_deal_votes ──────────────────────────────────
-- Public read so vote counts are visible on deal cards.
-- All vote writes go through /api/community?action=deal.vote
-- (service role).

ALTER TABLE community_deal_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cdv_public_read"
  ON community_deal_votes
  FOR SELECT
  USING (true);


-- ── 3. bus_crowding_reports ──────────────────────────────────
-- Raw reports are internal — no public read.
-- Aggregate data exposed via the crowding_averages VIEW.
-- All writes go through /api/crowding (service role).
-- RLS with no anon policies = full lockdown for anon key.

ALTER TABLE bus_crowding_reports ENABLE ROW LEVEL SECURITY;


-- ── 4. route_reliability ────────────────────────────────────
-- Reliability scores shown on arrival cards in the app.
-- Frontend reads via anon key; writes from cron job (service role).

ALTER TABLE route_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rr_public_read"
  ON route_reliability
  FOR SELECT
  USING (true);


-- ── 5. gas_prices ────────────────────────────────────────────
-- Gas price widget reads directly via anon key.
-- Writes are admin/backend only (service role).

ALTER TABLE gas_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gp_public_read"
  ON gas_prices
  FOR SELECT
  USING (true);


-- ── 6. social_feedback ───────────────────────────────────────
-- Anonymous INSERT allowed — users submit venue suggestions
-- directly from the frontend via the anon key (lib/supabase.ts).
-- No public SELECT — feedback is admin-review only via service role.

ALTER TABLE social_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sf_anon_insert"
  ON social_feedback
  FOR INSERT
  WITH CHECK (
    venue_name IS NOT NULL
    AND suggestion IS NOT NULL
    AND length(venue_name) <= 200
    AND length(suggestion) <= 1000
  );


-- ── 7. api_logs ──────────────────────────────────────────────
-- Internal telemetry written by backend functions only.
-- No public read or write. Full lockdown for anon key.

ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;


-- ── 8. lrt_notifications_sent ────────────────────────────────
-- Cron dedup table — internal only. Full lockdown for anon key.

ALTER TABLE lrt_notifications_sent ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- ADVISORY: event_rsvps (already RLS-enabled, not modified here)
-- The existing "delete_own" policy uses USING (true), meaning
-- any anon user can delete any other user's RSVP. Revisit when
-- Supabase Auth is introduced in Phase 6.
-- ============================================================
