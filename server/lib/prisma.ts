import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
  });
} catch (err) {
  console.error("Failed to initialize Prisma client:", err);
}

export { prisma };
export default prisma;
