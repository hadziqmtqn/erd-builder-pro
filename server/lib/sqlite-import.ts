import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export const MAX_SQLITE_IMPORT_BYTES = 50 * 1024 * 1024;

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "utf8");
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);
const REQUIRED_APP_TABLES = ["users", "projects", "diagrams"];

const NON_SQLITE_SQL = [
  /\bengine\s*=/i,
  /\bauto_increment\b/i,
  /\bunsigned\b/i,
  /\bserial\b/i,
  /\bcreate\s+extension\b/i,
  /\bcreate\s+(?:schema|sequence|function|procedure)\b/i,
  /\balter\s+sequence\b/i,
  /\bcopy\b[\s\S]*\bfrom\s+stdin\b/i,
  /\bowner\s+to\b/i,
  /\btablespace\b/i,
  /\b(?:lock|unlock)\s+tables?\b/i,
  /\bdelimiter\b/i,
  /\bset\s+(?:names|sql_mode|foreign_key_checks|statement_timeout|lock_timeout)\b/i,
  /::\s*[a-z_]/i,
  /\battach\s+database\b/i,
  /\bload_extension\s*\(/i,
  /\bvacuum\s+into\b/i,
];

function isGzipFile(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer.subarray(0, 2).equals(GZIP_MAGIC);
}

function isSqliteFile(buffer: Buffer): boolean {
  return buffer.length > SQLITE_MAGIC.length && buffer.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC);
}

function assertApplicationDatabase(db: Database.Database): void {
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error("SQLite integrity check failed");

  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?)")
    .all(...REQUIRED_APP_TABLES) as Array<{ name: string }>;
  const tables = new Set(rows.map((row) => row.name));
  if (REQUIRED_APP_TABLES.some((table) => !tables.has(table))) {
    throw new Error("Not an ERD Builder Pro database");
  }
}

function assertSqliteSql(sql: string): void {
  if (!sql.trim() || sql.includes("\u0000")) {
    throw new Error("The SQL file is empty or invalid");
  }
  if (NON_SQLITE_SQL.some((pattern) => pattern.test(sql))) {
    throw new Error("Only SQLite SQL dumps are supported; MySQL/PostgreSQL SQL is not accepted");
  }
}

function normalizePayload(buffer: Buffer): Buffer {
  let payload = buffer;
  if (isGzipFile(payload)) {
    try {
      payload = gunzipSync(payload, { maxOutputLength: MAX_SQLITE_IMPORT_BYTES });
    } catch {
      throw new Error("The gzip backup is invalid or exceeds the SQLite import limit");
    }
  }
  if (payload.length > MAX_SQLITE_IMPORT_BYTES) {
    throw new Error("The SQLite import file is too large. Maximum size is 50 MB");
  }
  return payload;
}

/** Normalize a raw SQLite DB or SQLite SQL dump into a validated raw DB buffer. */
export function normalizeSqliteImport(buffer: Buffer): Buffer {
  const payload = normalizePayload(buffer);

  if (isSqliteFile(payload)) {
    let db: Database.Database | null = null;
    let tempDir: string | null = null;
    try {
      // better-sqlite3's Buffer deserializer cannot read databases whose
      // header is in WAL mode (read/write version 2), which is how the
      // Desktop database is configured. Validate through a real SQLite file.
      tempDir = mkdtempSync(path.join(os.tmpdir(), "erd-builder-sqlite-import-"));
      const tempPath = path.join(tempDir, "import.db");
      writeFileSync(tempPath, payload, { flag: "wx" });
      db = new Database(tempPath, { readonly: true, fileMustExist: true });
      assertApplicationDatabase(db);
      return Buffer.from(payload);
    } catch {
      throw new Error("The file is not a valid ERD Builder Pro SQLite database");
    } finally {
      db?.close();
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const sql = payload.toString("utf8");
  assertSqliteSql(sql);

  let db: Database.Database | null = null;
  try {
    db = new Database(":memory:");
    db.exec(sql);
    assertApplicationDatabase(db);
    const normalized = db.serialize();
    if (normalized.length > MAX_SQLITE_IMPORT_BYTES) {
      throw new Error("The SQLite import database is too large. Maximum size is 50 MB");
    }
    return normalized;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Only SQLite")) throw error;
    throw new Error("The file is not a valid ERD Builder Pro SQLite SQL dump");
  } finally {
    db?.close();
  }
}
