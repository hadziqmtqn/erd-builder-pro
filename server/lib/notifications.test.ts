import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: { notification: { create: mocks.create, deleteMany: mocks.deleteMany, updateMany: mocks.updateMany } } }));

import { createNotifications, purgeExpiredNotifications, readNotificationGroup, safeNotificationLink, type NotificationInput } from "./notifications.js";

const DAY_MS = 86_400_000;
const migration = (variant: "sqlite" | "pg") =>
  readFileSync(path.resolve(`prisma/migrations-${variant}/20261115090000_add_notifications/migration.sql`), "utf8");

describe("notifications migration on SQLite", () => {
  it("adds the table to a database from an earlier release, runs again safely and keeps one row per event", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync(path.resolve("scripts/schema.sql"), "utf8"));
    db.exec(migration("sqlite"));
    db.exec(migration("sqlite"));
    db.pragma("foreign_keys = ON");
    db.exec("INSERT INTO users (id, email, password) VALUES ('u1', 'u1@test.local', 'x'), ('u2', 'u2@test.local', 'x')");
    const insert = db.prepare(`INSERT INTO notifications (id, recipient_user_id, actor_user_id, scope_type, type, entity_type, entity_id, source_event_id)
      VALUES (?, ?, ?, 'file', 'discussion.reply', 'discussion', 'thread-1', ?)`);

    insert.run("n1", "u1", "u2", "event-1");
    expect(() => insert.run("n2", "u1", "u2", "event-1")).toThrow(/UNIQUE/);
    insert.run("n3", "u2", "u1", "event-1");
    insert.run("n4", "u1", null, null);
    insert.run("n5", "u1", null, null);
    // Removing a user drops their own notifications and keeps the ones they triggered without the actor.
    db.exec("DELETE FROM users WHERE id = 'u2'");

    expect(db.prepare("SELECT id, actor_user_id, payload FROM notifications ORDER BY id").all()).toEqual([
      { id: "n1", actor_user_id: null, payload: "{}" },
      { id: "n4", actor_user_id: null, payload: "{}" },
      { id: "n5", actor_user_id: null, payload: "{}" },
    ]);
    db.close();
  });

  it("keeps the PostgreSQL migration idempotent and in step with the SQLite one", () => {
    const pg = migration("pg");
    expect(pg.match(/CREATE (UNIQUE )?(TABLE|INDEX) (?!IF NOT EXISTS)/g)).toBeNull();
    const indexes = (sql: string) => [...sql.matchAll(/INDEX IF NOT EXISTS "([^"]+)"/g)].map((match) => match[1]);
    expect(indexes(pg)).toEqual(indexes(migration("sqlite")));
  });
});

const input = (overrides: Partial<NotificationInput> = {}): NotificationInput => ({
  recipientUserId: "anind",
  actorUserId: "jay",
  scopeType: "file",
  teamId: "team-1",
  projectId: 7,
  featureType: "diagram",
  fileId: "file-uid",
  type: "discussion.reply",
  entityType: "discussion",
  entityId: "thread-1",
  link: "/diagrams/file-uid?thread=thread-1",
  sourceEventId: "message-1",
  payload: { fileName: "QA ERD" },
  ...overrides,
});

describe("createNotifications", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({});
  });

  it("stores one row per recipient with a JSON payload and skips the actor", async () => {
    const created = await createNotifications([input(), input({ recipientUserId: "jay" }), input({ recipientUserId: "hadziq", payload: undefined })]);

    expect(created).toBe(2);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ recipientUserId: "anind", link: "/diagrams/file-uid?thread=thread-1", payload: '{"fileName":"QA ERD"}' });
    expect(mocks.create.mock.calls[1][0].data).toMatchObject({ recipientUserId: "hadziq", payload: "{}" });
  });

  it("treats a repeated source event as already stored and rethrows other errors", async () => {
    mocks.create.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "P2002" }));
    await expect(createNotifications([input(), input()])).resolves.toBe(1);

    mocks.create.mockRejectedValueOnce(Object.assign(new Error("foreign key"), { code: "P2003" }));
    await expect(createNotifications([input()])).rejects.toThrow("foreign key");
  });

  it("refuses event, scope and feature types outside the allowlist", async () => {
    await expect(createNotifications([input({ type: "chat.message" as NotificationInput["type"] })])).rejects.toThrow(/Unsupported/);
    await expect(createNotifications([input({ scopeType: "workspace" as NotificationInput["scopeType"] })])).rejects.toThrow(/Unsupported/);
    await expect(createNotifications([input({ featureType: "db_client" as NotificationInput["featureType"] })])).rejects.toThrow(/Unsupported/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("drops a link that could leave the app", async () => {
    await createNotifications([input({ link: "https://evil.example/x" })]);
    expect(mocks.create.mock.calls[0][0].data.link).toBeNull();
  });
});

describe("safeNotificationLink", () => {
  it.each([
    ["/diagrams/abc?thread=1", "/diagrams/abc?thread=1"],
    ["/projects/7", "/projects/7"],
    ["//evil.example/x", null],
    ["https://evil.example/x", null],
    ["javascript:alert(1)", null],
    ["/a b", null],
    ["/a\\b", null],
    [`/${"a".repeat(512)}`, null],
    [null, null],
  ])("keeps %s as %s", (link, expected) => {
    expect(safeNotificationLink(link)).toBe(expected);
  });
});

describe("purgeExpiredNotifications", () => {
  const now = new Date("2026-11-15T00:00:00Z");

  beforeEach(() => {
    mocks.deleteMany.mockReset().mockResolvedValue({ count: 4 });
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_READ_RETENTION_DAYS;
    delete process.env.NOTIFICATION_RETENTION_DAYS;
  });

  it("deletes read rows after 90 days and every row after 180 days by default", async () => {
    await expect(purgeExpiredNotifications(now)).resolves.toBe(4);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } },
          { createdAt: { lt: new Date(now.getTime() - 180 * DAY_MS) } },
        ],
      },
    });
  });

  it("uses the operator's retention and ignores values that are not positive numbers", async () => {
    process.env.NOTIFICATION_READ_RETENTION_DAYS = "30";
    process.env.NOTIFICATION_RETENTION_DAYS = "0";
    await purgeExpiredNotifications(now);
    expect(mocks.deleteMany.mock.calls[0][0].where.OR).toEqual([
      { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
      { createdAt: { lt: new Date(now.getTime() - 180 * DAY_MS) } },
    ]);
  });
});

describe("readNotificationGroup (BUG-081)", () => {
  it("reads only the recipient's unread notifications of that group", async () => {
    mocks.updateMany.mockReset().mockResolvedValue({ count: 2 });
    expect(await readNotificationGroup("anind", "discussion:thread-1")).toBe(2);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: "anind", groupKey: "discussion:thread-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
