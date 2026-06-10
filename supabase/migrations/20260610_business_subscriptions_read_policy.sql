-- supabase/migrations/20260610_business_subscriptions_read_policy.sql
--
-- Allows an authenticated user to read their own business_subscriptions row
-- by matching the stored business_email (case-insensitive) against the email
-- in their JWT claim. Uses auth.jwt() ->> 'email' rather than a subquery into
-- auth.users, which is not reliably selectable from RLS policies in Supabase.

create policy "Users can read own subscription by email"
  on public.business_subscriptions
  for select
  to authenticated
  using (
    lower(business_email) = lower(auth.jwt() ->> 'email')
  );
