import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import app from "./index.js";
import { backfillUids } from "./lib/startup-migration.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { isDesktopMode } from "./lib/config.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const isProd = process.env.NODE_ENV === "production";

/**
 * For desktop mode (SQLite): if the offline migration didn't run (e.g. first
 * launch before the fix), ensure tables exist by applying schema.sql directly
 * via Prisma raw SQL. This is a fallback — the offline migration script is the
 * primary path.
 */
async function ensureDatabaseTables(): Promise<void> {
  if (!prisma || !isDesktopMode()) return;

  try {
    // Quick probe: does the users table exist?
    await prisma.$queryRawUnsafe("SELECT 1 FROM users LIMIT 1");
    // Table exists — nothing to do
    return;
  } catch {
    // Table doesn't exist — try to create from schema.sql
    logger.info("Users table not found — attempting to create from schema.sql");
  }

  // Find schema.sql relative to this script (bundled in dist-server/)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "schema.sql");

  if (!fs.existsSync(schemaPath)) {
    logger.warn({ schemaPath }, "schema.sql not found — cannot create tables");
    return;
  }

  const sql = fs.readFileSync(schemaPath, "utf8");
  // Strip SQL comments (-- CreateTable, -- CreateIndex) BEFORE splitting by ";"
  // because the schema.sql format puts "-- CreateTable" on the line before each
  // CREATE TABLE statement. Splitting first then filtering by startsWith("--")
  // would incorrectly remove the entire statement.
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let tableCount = 0;
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ";");
      tableCount++;
    } catch (err: any) {
      // Ignore "already exists" errors for idempotency
      if (err?.message?.includes("already exists")) continue;
      logger.warn({ err: err?.message, stmt: stmt.substring(0, 80) }, "Schema statement failed");
    }
  }

  logger.info({ tableCount }, "Database tables created via fallback schema apply");
}

// Ensure tables exist before backfill (critical for fresh desktop installs).
// MUST be awaited before app.listen() to prevent login race condition.
async function startup(): Promise<void> {
  try {
    await ensureDatabaseTables();
  } catch (err) {
    logger.warn({ err }, "Failed to ensure database tables");
  }

  try {
    await backfillUids();
  } catch (err) {
    logger.error({ err }, "Failed to backfill uids");
  }

  if (isProd) {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      console.log(`Serving static files from: ${distPath}`);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT} [${isProd ? "production" : "development"}]`);
  });
}

startup().catch((err) => {
  logger.error({ err }, "Startup failed");
  process.exit(1);
});
