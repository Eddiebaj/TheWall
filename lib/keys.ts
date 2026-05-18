// All API keys are loaded from environment variables (.env.local).
// EXPO_PUBLIC_ prefix makes them available in client code via process.env.
// The .env.local file is git-ignored and must not be committed.

export const OC_TRANSPO_API_KEY = process.env.EXPO_PUBLIC_OC_TRANSPO_API_KEY ?? '';
export const UNSPLASH_API_KEY = process.env.EXPO_PUBLIC_UNSPLASH_API_KEY ?? '';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://jcdpuduznewvbiqshklg.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjZHB1ZHV6bmV3dmJpcXNoa2xnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMzA5MjksImV4cCI6MjA5NDcwNjkyOX0.hIYWFvhfwZUSA8cqGubxVV1oRHnbhvMPtICXSiETe2o';
export const TICKETMASTER_API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY ?? '';
export const EVENTBRITE_API_KEY = process.env.EXPO_PUBLIC_EVENTBRITE_API_KEY ?? '';
export const FOURSQUARE_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';
