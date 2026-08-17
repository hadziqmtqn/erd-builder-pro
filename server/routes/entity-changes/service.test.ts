import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const originalDatabaseUrl = process.env.DATABASE_URL;
const tempDir = mkdtempSync(path.join(os.tmpdir(), "entity-history-"));
const databasePath = path.join(tempDir, "history.db");
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.DB_VARIANT = "sqlite";

const database = new Database(databasePath);
database.exec(readFileSync(path.resolve("scripts/schema.sql"), "utf8"));
database.close();

const { prisma } = await import("../../lib/prisma.js");
const notes = await import("../notes/service.js");
const history = await import("./service.js");

describe("entity history restore", () => {
  beforeAll(async () => {
    await prisma!.user.create({ data: { id: "history-user", email: "history@test.local", password: "test" } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects stale restores and saves safety revisions before a valid restore", async () => {
    const note = await notes.createNote({
      uid: "history-note",
      userId: "history-user",
      title: "Initial",
      content: "<p>Initial content</p>",
    });
    await notes.updateNote("history-note", "history-user", { title: "Changed", content: "<p>Changed</p>" });

    const opened = await history.listHistory("notes", "history-note", "history-user", 100);
    expect(opened?.revisions).toHaveLength(1);
    const revisionId = opened!.revisions[0].id;
    const detail = await history.readHistoryRevision("notes", "history-note", "history-user", revisionId);
    expect(detail?.snapshot).toMatchObject({ title: "Initial", content: "<p>Initial content</p>" });

    await new Promise(resolve => setTimeout(resolve, 5));
    await notes.updateNote("history-note", "history-user", { title: "Newer change" });
    await expect(history.restoreHistoryRevision({
      entityType: "notes",
      uid: "history-note",
      userId: "history-user",
      revisionId,
      expectedUpdatedAt: opened!.current_updated_at,
    })).resolves.toMatchObject({ status: "conflict" });

    const refreshed = await history.listHistory("notes", "history-note", "history-user", 100);
    await expect(history.restoreHistoryRevision({
      entityType: "notes",
      uid: "history-note",
      userId: "history-user",
      revisionId,
      expectedUpdatedAt: refreshed!.current_updated_at,
    })).resolves.toMatchObject({ status: "ok" });

    const restored = await prisma!.note.findUnique({ where: { id: note.id } });
    expect(restored).toMatchObject({ title: "Initial", content: "<p>Initial content</p>", version: 3 });
    const revisions = await history.listHistory("notes", "history-note", "history-user", 100);
    expect(revisions?.revisions.map(item => item.change_type)).toEqual(["restore", "pre_restore", "update"]);
  });
});
