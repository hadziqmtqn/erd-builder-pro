import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.DISCUSSION_CONTEXT_MIGRATION_INTEGRATION === "1";
const schema = "test_discussion_context_migration_" + randomUUID().replaceAll("-", "");
let pool: pg.Pool | null = null;
let schemaCreated = false;
let migratedState: any = null;

describe.skipIf(!enabled)("COL-003 PostgreSQL Discussion anchor migration", () => {
  beforeAll(async () => {
    dotenv.config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      throw new Error("Discussion migration integration requires a localhost PostgreSQL URL.");
    }

    pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    await pool.query("CREATE SCHEMA \"" + schema + "\"");
    schemaCreated = true;
    const connection = await pool.connect();
    try {
      await connection.query("SET search_path TO \"" + schema + "\"");
      await connection.query(`
        CREATE TABLE "discussion_threads" (
          "id" TEXT PRIMARY KEY,
          "status" TEXT NOT NULL,
          "created_by" TEXT NOT NULL
        );
        CREATE TABLE "discussion_contexts" (
          "id" TEXT PRIMARY KEY,
          "thread_id" TEXT NOT NULL REFERENCES "discussion_threads"("id") ON DELETE CASCADE,
          "feature_type" TEXT NOT NULL,
          "file_id" TEXT NOT NULL,
          "anchor_type" TEXT NOT NULL,
          "anchor_id" TEXT,
          "anchor_label" TEXT NOT NULL,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "discussion_messages" (
          "id" TEXT PRIMARY KEY,
          "thread_id" TEXT NOT NULL,
          "body" TEXT NOT NULL
        );
        CREATE TABLE "discussion_reads" (
          "thread_id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "last_read_at" TIMESTAMPTZ NOT NULL,
          PRIMARY KEY ("thread_id", "user_id")
        );
        CREATE TABLE "comment_threads" (
          "id" TEXT PRIMARY KEY,
          "anchor_type" TEXT NOT NULL,
          "anchor_id" TEXT NOT NULL,
          "anchor_label" TEXT NOT NULL
        );
        INSERT INTO "discussion_threads" VALUES ('thread-1', 'open', 'member-1');
        INSERT INTO "discussion_contexts" ("id", "thread_id", "feature_type", "file_id", "anchor_type", "anchor_id", "anchor_label")
          VALUES ('context-1', 'thread-1', 'diagram', 'diagram-1', 'table', 'entity-1', 'users');
        INSERT INTO "discussion_messages" VALUES ('message-1', 'thread-1', 'Keep this message');
        INSERT INTO "discussion_reads" VALUES ('thread-1', 'member-1', '2026-09-30T00:00:00Z');
        INSERT INTO "comment_threads" VALUES ('comment-1', 'table', 'entity-1', 'users');
      `);
      const migration = readFileSync(
        path.resolve("prisma/migrations-pg/20260930140000_remove_discussion_context_anchors/migration.sql"),
        "utf8",
      );
      await connection.query(migration);

      const columns = await connection.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'discussion_contexts'",
        [schema],
      );
      const context = await connection.query('SELECT "id", "thread_id", "feature_type", "file_id" FROM "discussion_contexts"');
      const thread = await connection.query('SELECT "id", "status", "created_by" FROM "discussion_threads"');
      const message = await connection.query('SELECT "body" FROM "discussion_messages"');
      const read = await connection.query('SELECT "last_read_at" FROM "discussion_reads"');
      const comment = await connection.query('SELECT "anchor_type", "anchor_id", "anchor_label" FROM "comment_threads"');
      migratedState = {
        contextColumns: columns.rows.map((column: { column_name: string }) => column.column_name),
        context: context.rows,
        thread: thread.rows,
        message: message.rows,
        read: read.rows,
        comment: comment.rows,
      };
    } finally {
      connection.release();
    }
  }, 30000);

  afterAll(async () => {
    if (schemaCreated && pool) {
      await pool.query("DROP SCHEMA \"" + schema + "\" CASCADE");
      expect((await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = $1", [schema])).rows).toEqual([]);
    }
    await pool?.end();
  });

  it("removes only Discussion anchors and preserves all history plus Comment ERD anchors", () => {
    expect(migratedState.contextColumns).not.toEqual(expect.arrayContaining(["anchor_type", "anchor_id", "anchor_label"]));
    expect(migratedState.context).toEqual([
      { id: "context-1", thread_id: "thread-1", feature_type: "diagram", file_id: "diagram-1" },
    ]);
    expect(migratedState.thread).toEqual([{ id: "thread-1", status: "open", created_by: "member-1" }]);
    expect(migratedState.message).toEqual([{ body: "Keep this message" }]);
    expect(migratedState.read[0].last_read_at.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(migratedState.comment).toEqual([
      { anchor_type: "table", anchor_id: "entity-1", anchor_label: "users" },
    ]);
  });
});
