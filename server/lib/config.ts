import { createClient } from "@supabase/supabase-js";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
export const JWT_SECRET = process.env.JWT_SECRET || "erd-builder-secret-key";

// R2 Config
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// Initialize Supabase
export let supabase: any = null;
try {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
