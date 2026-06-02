import { PrismaClient } from "@prisma/client";

// Serverless (Vercel) global cache — reuses PrismaClient across warm invocations
// instead of creating a new connection pool per request.
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient;
};

let prisma: PrismaClient | null = null;

try {
  prisma = globalForPrisma.__prisma ?? new PrismaClient({
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
