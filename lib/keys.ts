// All API keys are loaded from environment variables (.env.local).
// EXPO_PUBLIC_ prefix makes them available in client code via process.env.
// The .env.local file is git-ignored and must not be committed.

export const OC_TRANSPO_API_KEY = process.env.EXPO_PUBLIC_OC_TRANSPO_API_KEY ?? '';
export const UNSPLASH_API_KEY = process.env.EXPO_PUBLIC_UNSPLASH_API_KEY ?? '';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://bzvkadttywgszovbowch.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmthZHR0eXdnc3pvdmJvd2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDY0OTMsImV4cCI6MjA4ODM4MjQ5M30.pRmZvhBjvgHTa2Pwl0nu2Og3mgY0pDnjR7TndITj2eg';
export const TICKETMASTER_API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY ?? '';
export const EVENTBRITE_API_KEY = process.env.EXPO_PUBLIC_EVENTBRITE_API_KEY ?? '';
export const FOURSQUARE_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ?? '';
