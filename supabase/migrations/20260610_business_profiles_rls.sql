-- Fix business_profiles RLS so authenticated users can upsert their own row.
--
-- Root cause: the existing ALL policy was almost certainly written with
--   USING (id = auth.uid()) — which matches the PK (a UUID), not the FK
--   user_id column. Because WITH CHECK defaults to the USING expression,
--   every INSERT fails: the new row's `id` is a fresh UUID, never equal
--   to auth.uid().
--
-- Strategy: drop the misnamed/broken policy by its likely name (both
-- common variants), then create a correct one with explicit WITH CHECK.

DROP POLICY IF EXISTS "Users can manage own business profile" ON public.business_profiles;
DROP POLICY IF EXISTS "Users can manage own" ON public.business_profiles;

CREATE POLICY "Users can manage own business profile"
  ON public.business_profiles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
