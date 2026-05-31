import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase VITE environment variables are missing. AI context/mentions/realtime will be unavailable. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.");
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
