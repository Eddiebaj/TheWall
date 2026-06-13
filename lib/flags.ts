// Feature flags  -  flip PREMIUM_ENABLED to true to activate paywalls.
// While false, all gates are bypassed and every user gets premium access.
//
// Before flipping PREMIUM_ENABLED to true, ensure:
//   1. RevenueCat is configured with real product IDs (EXPO_PUBLIC_RC_KEY_IOS / ANDROID)
//   2. App Store / Play Console products are live and approved
//   3. STRIPE_LINKS env vars are set to live-mode payment links
//   4. Stripe webhook is deployed and verified (api/stripe-webhook.js)
export const PREMIUM_ENABLED = false;
export const TRANSIT_MEMORY_ENABLED = false;
