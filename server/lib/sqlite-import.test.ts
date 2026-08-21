import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { normalizeSqliteImport } from "./sqlite-import.js";

function appDatabaseBuffer(): Buffer {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE projects (id INTEGER PRIMARY KEY);
    CREATE TABLE diagrams (id INTEGER PRIMARY KEY);
  `);
  const buffer = db.serialize();
  db.close();
  return buffer;
}

describe("normalizeSqliteImport", () => {
  it("accepts a raw SQLite database and the automatic .sql.gz format", () => {
    const raw = appDatabaseBuffer();

    expect(normalizeSqliteImport(raw)).toEqual(raw);
    expect(normalizeSqliteImport(gzipSync(raw))).toEqual(raw);
  });

  it("accepts the WAL-mode database produced by Desktop backups", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "erd-sqlite-import-test-"));
    const sourcePath = path.join(tempDir, "source.db");
    const backupPath = path.join(tempDir, "backup.db");

    try {
      const db = new Database(sourcePath);
      db.pragma("journal_mode = WAL");
      db.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY);
        CREATE TABLE projects (id INTEGER PRIMARY KEY);
        CREATE TABLE diagrams (id INTEGER PRIMARY KEY);
      `);
      await db.backup(backupPath);
      db.close();

      expect(normalizeSqliteImport(readFileSync(backupPath))).toEqual(readFileSync(backupPath));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts a SQLite SQL dump and normalizes it to a database", () => {
    const sql = `
      PRAGMA foreign_keys=OFF;
      BEGIN TRANSACTION;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE projects (id INTEGER PRIMARY KEY);
      CREATE TABLE diagrams (id INTEGER PRIMARY KEY);
      INSERT INTO users VALUES ('user-1');
      COMMIT;
    `;

    const result = normalizeSqliteImport(Buffer.from(sql));
    const db = new Database(result, { readonly: true });
    expect(db.prepare("SELECT id FROM users").pluck().get()).toBe("user-1");
    db.close();
  });

  it("rejects MySQL and PostgreSQL SQL", () => {
    expect(() => normalizeSqliteImport(Buffer.from(
      "CREATE TABLE users (id INTEGER) ENGINE=InnoDB;",
    ))).toThrow("Only SQLite SQL dumps are supported");
    expect(() => normalizeSqliteImport(Buffer.from(
      "CREATE TABLE users (id SERIAL);",
    ))).toThrow("Only SQLite SQL dumps are supported");
  });

  it("rejects a valid SQLite file that is not an ERD Builder Pro database", () => {
    expect(() => normalizeSqliteImport(Buffer.from("CREATE TABLE other (id INTEGER);")))
      .toThrow("valid ERD Builder Pro SQLite SQL dump");
  });
});
