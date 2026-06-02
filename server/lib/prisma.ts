import { PrismaClient } from "@prisma/client";

// Serverless (Vercel) global cache — reuses PrismaClient across warm invocations
// instead of creating a new connection pool per request.
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient;
};

function buildPrismaUrl(): string {
  const baseUrl = process.env.DATABASE_URL || "";
  // In serverless (Vercel), multiple concurrent instances each create their own pool.
  // Without limiting `connection_limit`, Prisma defaults to 10 connections per instance.
  // Combined with Supabase's pooler limit of 15, even 2 concurrent instances can exhaust it.
  // `pgbouncer=true` ensures compatibility with PgBouncer in session/transaction mode.
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
    // If DATABASE_URL is invalid, let Prisma handle the error natively
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
