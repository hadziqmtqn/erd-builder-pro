import { createClient } from "@supabase/supabase-js";

// Note: In Vercel Edge Runtime, process.env is populated directly from Vercel environment variables.
// We don't use dotenv.config() here as it's not compatible with Edge (it uses 'fs').

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Edge-safe Supabase client
export const getEdgeSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are missing");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });
};
