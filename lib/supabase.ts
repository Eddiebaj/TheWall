import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bzvkadttywgszovbowch.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmthZHR0eXdnc3pvdmJvd2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDY0OTMsImV4cCI6MjA4ODM4MjQ5M30.pRmZvhBjvgHTa2Pwl0nu2Og3mgY0pDnjR7TndITj2eg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
