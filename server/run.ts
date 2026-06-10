import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
import app from "./index.js";
import { backfillUids } from "./lib/startup-migration.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { isDesktopMode, useLocalAuth } from "./lib/config.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const isProd = process.env.NODE_ENV === "production";

/**
 * Seed default AI providers, models, and system prompts for fresh desktop installs.
 * Mirror of prisma/seed.sqlite.ts but runs inline in the startup fallback path.
 */
async function seedAIProviders(): Promise<void> {
  if (!prisma) return;

  try {
    // Check if any providers exist already
    const existing = await prisma.aiProvider.count();
    if (existing > 0) return;

    logger.info("Seeding default AI providers, models, and system prompts");

    // ── AI Providers ──
    const providerDefs = [
      { name: "OpenAI", code: "openai", baseUrl: "https://api.openai.com/v1" },
      { name: "Google Gemini", code: "gemini", baseUrl: null },
      { name: "OpenAI Compatible", code: "openai_compatible", baseUrl: "https://ai.paas.id" },
    ];

    for (const p of providerDefs) {
      await (prisma as any).aiProvider.create({
        data: { name: p.name, code: p.code, baseUrl: p.baseUrl, isActive: true },
      });
    }

    // ── AI Models ──
    const openai = await (prisma as any).aiProvider.findUnique({ where: { code: "openai" } });
    const gemini = await (prisma as any).aiProvider.findUnique({ where: { code: "gemini" } });
    const openaiCompat = await (prisma as any).aiProvider.findUnique({ where: { code: "openai_compatible" } });

    if (openai) {
      await (prisma as any).aiModel.createMany({
        data: [
          { providerId: openai.id, modelIdentifier: "gpt-4o", displayName: "GPT-4o", contextWindow: 128000, isActive: true },
          { providerId: openai.id, modelIdentifier: "gpt-4o-mini", displayName: "GPT-4o Mini", contextWindow: 128000, isActive: true },
          { providerId: openai.id, modelIdentifier: "gpt-4-turbo", displayName: "GPT-4 Turbo", contextWindow: 128000, isActive: true },
        ],
      });
    }

    if (gemini) {
      await (prisma as any).aiModel.createMany({
        data: [
          { providerId: gemini.id, modelIdentifier: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", contextWindow: 1048576, isActive: true },
          { providerId: gemini.id, modelIdentifier: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", contextWindow: 1048576, isActive: true },
        ],
      });
    }

    if (openaiCompat) {
      await (prisma as any).aiModel.createMany({
        data: [
          { providerId: openaiCompat.id, modelIdentifier: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", contextWindow: 128000, isActive: true },
        ],
      });
    }

    // ── Default system prompt ──
    const hasPrompt = await (prisma as any).aiSystemPrompt.count();
    if (hasPrompt === 0) {
      await (prisma as any).aiSystemPrompt.create({
        data: {
          id: "default-simple-direct",
          name: "Simple & Direct",
          content: `You are an AI assistant for ERD Builder Pro — an integrated workspace combining Database ERD diagrams, Flowcharts, and Markdown Notes.

Key capabilities:
- When discussing database schemas, provide SQL DDL in \`\`\`sql blocks
- For flowcharts, provide JSON with nodes/edges in \`\`\`json blocks
- Be concise and direct in your responses
- Help users design databases, create flowcharts, and take notes`,
          category: "system",
          isDefault: true,
          isBuiltIn: true,
          userId: null,
        },
      });
    }

    logger.info("Default AI providers seeded successfully");
  } catch (err) {
    logger.warn({ err }, "Failed to seed default AI providers (non-fatal)");
  }
}

/**
 * For desktop mode (SQLite): if the offline migration didn't run (e.g. first
 * launch before the fix), ensure tables exist by applying schema.sql directly
 * via Prisma raw SQL. This is a fallback — the offline migration script is the
 * primary path.
 */
async function ensureDatabaseTables(): Promise<boolean> {
  if (!prisma || !isDesktopMode()) return false;

  try {
    // Quick probe: does the users table exist?
    await prisma.$queryRawUnsafe("SELECT 1 FROM users LIMIT 1");
    // Table exists — database is ready, signal caller
    return true;
  } catch {
    // Table doesn't exist — try to create from schema.sql
    logger.info("Users table not found — attempting to create from schema.sql");
  }

  // Find schema.sql relative to this script (bundled in dist-server/)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "schema.sql");

  if (!fs.existsSync(schemaPath)) {
    logger.warn({ schemaPath }, "schema.sql not found — cannot create tables");
    return false;
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
  return true;
}

// Ensure tables exist before backfill (critical for fresh desktop installs).
// MUST be awaited before app.listen() to prevent login race condition.
// Startup sequence with robust DB readiness check
async function startup(): Promise<void> {
  // Desktop mode only: retry DB readiness in case offline migration hasn't run yet
  // (SQLite file may not be ready immediately on first launch)
  if (isDesktopMode()) {
    const maxRetries = 60; // about 60 seconds total
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
    let ready = false;
    for (let i = 0; i < maxRetries; i++) {
      ready = await ensureDatabaseTables();
      console.log(`[startup/db-readiness] attempt ${i + 1}/${maxRetries} - ${ready ? 'READY' : 'PENDING'}`);
      if (ready) break;
      await sleep(1000);
    }
    if (!ready) {
      logger.error("Database readiness not achieved within timeout. Exiting.");
      process.exit(1);
    }
  }

  // Seed default AI data for desktop mode (providers, models, system prompts).
  // Safe to call every startup — seedAIProviders checks if data already exists.
  await seedAIProviders();

  // Seed admin user for local auth modes (both SQLite and local PostgreSQL).
  // This runs at startup so the user exists immediately — no need to wait
  // for the first browser request to /api/me. Credentials match the seed
  // script and ensureDesktopUser() in auth.ts.
  if (useLocalAuth() && prisma) {
    try {
      const adminEmail = "admin@local.dev";
      const adminPassword = "admin123";
      const existing = await prisma.user.findFirst({
        where: { email: adminEmail } as any,
      });
      if (!existing) {
        const salt = randomBytes(16).toString("hex");
        const hash = scryptSync(adminPassword, salt, 64).toString("hex");
        await prisma.user.create({
          data: {
            email: adminEmail,
            name: "Admin",
            password: `${salt}:${hash}`,
          } as any,
        });
        logger.info({ email: adminEmail }, "Admin user created during startup");
      }
    } catch (err) {
      logger.warn({ err }, "Failed to ensure admin user (non-fatal)");
    }
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
