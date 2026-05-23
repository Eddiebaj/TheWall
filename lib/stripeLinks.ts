// Stripe payment links — set via environment variables.
// Test-mode links go in .env.local; live links go in Vercel environment variables.
export const STRIPE_LINKS = {
  // Business plans
  business_beta:         process.env.EXPO_PUBLIC_STRIPE_LINK_BUSINESS_BETA         ?? '',
  business_launch:       process.env.EXPO_PUBLIC_STRIPE_LINK_BUSINESS_LAUNCH       ?? '',
  business_scale:        process.env.EXPO_PUBLIC_STRIPE_LINK_BUSINESS_SCALE        ?? '',
  business_single_event: process.env.EXPO_PUBLIC_STRIPE_LINK_BUSINESS_SINGLE_EVENT ?? '',

  // Organizer plan
  organizer_monthly: process.env.EXPO_PUBLIC_STRIPE_LINK_ORGANIZER_MONTHLY ?? '',

  // User premium
  premium_monthly: process.env.EXPO_PUBLIC_STRIPE_LINK_PREMIUM_MONTHLY ?? '',
  premium_annual:  process.env.EXPO_PUBLIC_STRIPE_LINK_PREMIUM_ANNUAL  ?? '',
};
