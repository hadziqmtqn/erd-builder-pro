#!/usr/bin/env node

/**
 * ERD Builder Pro — Offline Database Migration Script
 *
 * Replaces `prisma db push` for desktop builds.
 * Uses better-sqlite3 directly to apply the pre-generated schema.sql
 * to a fresh SQLite database.
 *
 * Usage: node scripts/migrate-db.mjs <path-to-db>
 *
 * The schema.sql file must be in the same directory as this script.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function main() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("Usage: migrate-db.mjs <path-to-database>");
    process.exit(1);
  }

  // Load better-sqlite3 (native addon from bundled node_modules)
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch (err) {
    console.error("Failed to load better-sqlite3:", err.message);
    process.exit(1);
  }

  // Read the pre-generated schema SQL
  const schemaPath = resolve(__dirname, "schema.sql");
  if (!existsSync(schemaPath)) {
    console.error(`Schema file not found at: ${schemaPath}`);
    process.exit(1);
  }

  const schemaSql = readFileSync(schemaPath, "utf8");

  console.log(`Applying schema to: ${dbPath}`);

  // Open the database (creates it if it doesn't exist)
  const db = new Database(dbPath, {});

  // Enable WAL mode for better performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Execute the schema in an implicit transaction
  // Strip SQL comments (-- CreateTable, -- CreateIndex) BEFORE splitting by ";"
  // because the schema.sql format puts "-- CreateTable" on the line before each
  // CREATE TABLE statement. Splitting first then filtering by startsWith("--")
  // would incorrectly remove the entire statement.
  const statements = schemaSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  try {
    db.exec("BEGIN TRANSACTION");

    for (const stmt of statements) {
      try {
        db.exec(stmt + ";");
      } catch (err) {
        // Ignore "already exists" errors for idempotent migration
        if (
          err.message &&
          err.message.includes("already exists")
        ) {
          continue;
        }
        throw err;
      }
    }

    db.exec("COMMIT");
    console.log("Schema applied successfully.");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("Failed to apply schema:", err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
