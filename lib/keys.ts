// All API keys are loaded from environment variables (.env.local).
// EXPO_PUBLIC_ prefix makes them available in client code via process.env.
// The .env.local file is git-ignored and must not be committed.

export const OC_TRANSPO_API_KEY = process.env.EXPO_PUBLIC_OC_TRANSPO_API_KEY ?? '';
export const UNSPLASH_API_KEY = process.env.EXPO_PUBLIC_UNSPLASH_API_KEY ?? '';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
