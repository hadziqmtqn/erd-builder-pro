/**
 * Reset admin password for self-hosted ERD Builder Pro.
 * Usage: npx tsx scripts/reset-password.ts --email admin@local.dev --password newpass123
 */
import { parseArgs } from "node:util";
import { scryptSync, randomBytes } from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

dotenv.config();

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
  },
});

const email = (values.email ?? "").trim().toLowerCase();
const password = values.password ?? "";

if (!email || !password) {
  console.error("Usage: npx tsx scripts/reset-password.ts --email <email> --password <new-password>");
  process.exit(1);
}

if (password.length < 6) {
  console.error("Password must be at least 6 characters");
  process.exit(1);
}

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function resolveDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    return `file:${path.resolve(process.cwd(), "data.db")}`;
  }
  return process.env.DATABASE_URL;
}

function isSqliteUrl(url: string): boolean {
  return url.startsWith("file:") || url.endsWith(".db");
}

function createPrismaClient(): PrismaClient {
  const url = resolveDatabaseUrl();
  const adapter = isSqliteUrl(url)
    ? new PrismaBetterSqlite3({ url })
    : new PrismaPg({ connectionString: url });

  return new PrismaClient({ adapter, log: ["error"] });
}

async function main() {
  const prisma = createPrismaClient();

  try {
    const user = await (prisma as any).user.findFirst({
      where: { email },
    });

    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    await (prisma as any).user.update({
      where: { id: (user as any).id },
      data: { password: hashPassword(password) },
    });

    console.log(`Password reset for ${email}`);
  } catch (err: any) {
    console.error("Failed:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
