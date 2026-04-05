import { createClient } from "@supabase/supabase-js";

// Note: In Vercel Edge Runtime, process.env is populated directly from Vercel environment variables.
// We don't use dotenv.config() here as it's not compatible with Edge (it uses 'fs').

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const JWT_SECRET = process.env.JWT_SECRET || "erd-builder-secret-key";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

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
