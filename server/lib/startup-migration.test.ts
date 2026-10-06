import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { isUuid, replaceColumnIdInHandle } from "./erd-column-id-migration";

describe("startup migration helpers", () => {
  it("detects legacy column ids and rewrites relationship handles", () => {
    const uuid = "018f3f7e-1c33-73f2-a4e4-19b55e61d3fa";

    expect(isUuid(uuid)).toBe(true);
    expect(isUuid("col_1720000000_0")).toBe(false);
    expect(replaceColumnIdInHandle("col-col_1720000000_0-source", "col_1720000000_0", uuid))
      .toBe(`col-${uuid}-source`);
    expect(replaceColumnIdInHandle("col-col_1720000000_01-source", "col_1720000000_0", uuid))
      .toBe("col-col_1720000000_01-source");
  });

  it("removes Discussion anchor columns in SQLite without losing file or thread history", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    try {
      db.exec(`
        CREATE TABLE discussion_threads (id TEXT PRIMARY KEY);
        CREATE TABLE discussion_contexts (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          feature_type TEXT NOT NULL,
          file_id TEXT NOT NULL,
          anchor_type TEXT NOT NULL CHECK (anchor_type IN ('general', 'table', 'relationship')),
          anchor_id TEXT,
          anchor_label TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (thread_id) REFERENCES discussion_threads(id) ON DELETE CASCADE
        );
        CREATE TABLE discussion_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE discussion_reads (thread_id TEXT NOT NULL, user_id TEXT NOT NULL, last_read_at TEXT NOT NULL);
        CREATE TABLE comment_threads (
          id TEXT PRIMARY KEY,
          anchor_type TEXT NOT NULL,
          anchor_id TEXT NOT NULL,
          anchor_label TEXT NOT NULL
        );
        INSERT INTO discussion_threads VALUES ('thread-1');
        INSERT INTO discussion_contexts VALUES ('context-1', 'thread-1', 'diagram', '42', 'table', 'entity-1', 'users', CURRENT_TIMESTAMP);
        INSERT INTO discussion_messages VALUES ('message-1', 'thread-1', 'Keep this message');
        INSERT INTO discussion_reads VALUES ('thread-1', 'member-1', '2026-09-30T00:00:00Z');
        INSERT INTO comment_threads VALUES ('comment-1', 'table', 'entity-1', 'users');
      `);
      const migration = readFileSync(new URL("../../prisma/migrations-sqlite/20260930140000_remove_discussion_context_anchors/migration.sql", import.meta.url), "utf8");
      db.exec(migration);

      const columns = (db.pragma("table_info(discussion_contexts)") as Array<{ name: string }>).map((column) => column.name);
      expect(columns).not.toContain("anchor_type");
      expect(columns).not.toContain("anchor_id");
      expect(columns).not.toContain("anchor_label");
      expect(db.prepare("SELECT id, thread_id, feature_type, file_id FROM discussion_contexts").get()).toEqual({
        id: "context-1", thread_id: "thread-1", feature_type: "diagram", file_id: "42",
      });
      expect(db.prepare("SELECT body FROM discussion_messages WHERE id = ?").get("message-1")).toEqual({ body: "Keep this message" });
      expect(db.prepare("SELECT last_read_at FROM discussion_reads").get()).toEqual({ last_read_at: "2026-09-30T00:00:00Z" });
      expect(db.prepare("SELECT anchor_type, anchor_id, anchor_label FROM comment_threads WHERE id = ?").get("comment-1")).toEqual({
        anchor_type: "table", anchor_id: "entity-1", anchor_label: "users",
      });
    } finally {
      db.close();
    }
  });
});
