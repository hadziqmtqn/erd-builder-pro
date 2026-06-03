import { PrismaClient } from "@prisma/client";

// Serverless (Vercel) global cache — reuses PrismaClient across warm invocations
// instead of creating a new connection pool per request.
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient;
};

function isSqlite(url: string): boolean {
  return url.startsWith("file:") || url.endsWith(".db");
}

function buildPrismaUrl(): string {
  const baseUrl = process.env.DATABASE_URL || "";
  // If no DATABASE_URL is provided (e.g., packaged desktop app), fallback to a local SQLite DB
  if (!baseUrl) {
    // Use an absolute path to ensure the same DB file across launches
    const path = require('path');
    const dbPath = path.resolve(process.cwd(), 'data.db');
    return `file:${dbPath}`;
  }
  if (isSqlite(baseUrl)) {
    // SQLite: no pool configuration needed
    return baseUrl;
  }
  // PostgreSQL (Vercel/Supabase): limit connection pool to avoid exhausting
  // Supabase's 15-connection pooler limit when multiple Vercel instances run.
  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "3");
    }
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

let prisma: PrismaClient | null = null;

try {
  prisma = globalForPrisma.__prisma ?? new PrismaClient({
    datasources: {
      db: { url: buildPrismaUrl() },
    },
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
  });
  globalForPrisma.__prisma = prisma;
} catch (err) {
  console.error("Failed to initialize Prisma client:", err);
}

export { prisma };
export default prisma;
