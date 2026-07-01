import { createClient } from "@supabase/supabase-js";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || "";

// R2 Config
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// GitHub Config
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "";
export const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || "";

export function isDesktopMode(): boolean {
  const dbUrl = process.env.DATABASE_URL || "";
  return dbUrl === "" || dbUrl.startsWith("file:") || dbUrl.endsWith(".db");
}

export function getInstallMode(): string {
  if (process.env.ERD_INSTALL_MODE === "cli") return "cli";
  if (process.env.VERCEL) return "vercel";
  if (process.env.DOCKER || isInDocker()) return "docker";
  if (isDesktopMode()) return "desktop";
  return "web";
}

function isInDocker(): boolean {
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

/** True when using local PostgreSQL (no Supabase auth). */
export function isLocalPostgres(): boolean {
  const dbUrl = process.env.DATABASE_URL || "";
  if (isDesktopMode()) return false;
  // PostgreSQL URL without SUPABASE_URL → local auth
  return dbUrl.startsWith("postgresql://") && !process.env.SUPABASE_URL;
}

/** True when auth is handled locally (desktop/SQLite or local PostgreSQL). */
export function useLocalAuth(): boolean {
  return isDesktopMode() || isLocalPostgres();
}

// Initialize Supabase
const SUPABASE_CLIENT_KEY = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
export let supabase: any = null;
try {
  if (SUPABASE_URL && SUPABASE_CLIENT_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_CLIENT_KEY);
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
}
