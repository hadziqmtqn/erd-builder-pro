import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('invalid.supabase.co'));

if (!supabaseConfigured) {
  console.warn("Supabase VITE environment variables are missing. AI context/mentions/realtime will be unavailable. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable.");
}

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true },
    })
  : (null as unknown as ReturnType<typeof createClient>);
