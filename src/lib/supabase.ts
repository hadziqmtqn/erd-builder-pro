import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL ERROR: Supabase VITE environment variables are missing! Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.");
}

export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co', 
  supabaseAnonKey || 'invalid',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
    }
  }
);
