import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { isLocalPostgres } from "./config.js";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaWarmed: boolean | undefined;
}

function isSqliteUrl(url: string): boolean {
  return url.startsWith("file:") || url.endsWith(".db");
}

function resolveDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    return `file:${path.resolve(process.cwd(), "data.db")}`;
  }
  return process.env.DATABASE_URL;
}

function buildPrismaPgOptions(): { connectionString: string } {
  const baseUrl = resolveDatabaseUrl();

  if (isLocalPostgres()) {
    return { connectionString: baseUrl };
  }

  // Supabase PostgreSQL: limit connection pool to avoid exhausting
  // Supabase's 15-connection pooler limit when multiple Vercel instances run.
  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "10");
    }
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return { connectionString: url.toString() };
  } catch {
    return { connectionString: baseUrl };
  }
}

function createPrismaClient(): PrismaClient {
  const url = resolveDatabaseUrl();
  const adapter = isSqliteUrl(url)
    ? new PrismaBetterSqlite3({ url })
    : new PrismaPg(buildPrismaPgOptions());

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
  });
}

let prisma: PrismaClient | null = null;

try {
  prisma = globalThis.__prisma ?? createPrismaClient();
  globalThis.__prisma = prisma;

  // Warm up the Prisma connection pool on startup so the first page load
  // doesn't pay the cold-start penalty of establishing connections.
  if (!globalThis.__prismaWarmed) {
    globalThis.__prismaWarmed = true;
    const url = resolveDatabaseUrl();
    if (prisma && !isSqliteUrl(url)) {
      prisma.$queryRawUnsafe("SELECT 1").catch(() => {});
    }
  }
} catch (err) {
  console.error("Failed to initialize Prisma client:", err);
  // CRITICAL: DO NOT throw here. A Prisma init failure must NOT crash the
  // Node.js server process. The server should start without Prisma so that
  // health-check endpoints (/api/me, etc.) can return graceful error responses
  // instead of the frontend seeing a hanging connection.
  // When prisma is null, all route handlers will safely return errors.
  prisma = null;
}

export { prisma };
export default prisma;
