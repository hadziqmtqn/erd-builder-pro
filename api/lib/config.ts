import { createClient } from "@supabase/supabase-js";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const JWT_SECRET = process.env.JWT_SECRET || "erd-builder-secret-key";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

// R2 Config
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// Initialize Supabase
export let supabase: any = null;

// Diagnostics for Vercel deployment
console.log("Supabase initialization check:");
console.log("- SUPABASE_URL:", SUPABASE_URL ? "SET (starts with " + SUPABASE_URL.substring(0, 8) + "...)" : "MISSING");
console.log("- SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "SET (length: " + SUPABASE_SERVICE_ROLE_KEY.length + ")" : "MISSING");
console.log("- NODE_ENV:", process.env.NODE_ENV);

try {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    if (!SUPABASE_URL.startsWith("http")) {
      console.error("CRITICAL: SUPABASE_URL is not a valid URL (doesn't start with http/https)");
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log("Supabase client created successfully");
  } else {
    console.warn("Supabase client NOT created due to missing environment variables");
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

// Initialize S3/R2
export let s3Client: S3Client | null = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  const accountId = R2_ACCOUNT_ID.includes(".r2.cloudflarestorage.com") 
    ? R2_ACCOUNT_ID.split(".")[0].replace("https://", "")
    : R2_ACCOUNT_ID;

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false, 
  });
  console.log(`Cloudflare R2 client initialized for account: ${accountId}`);
}
