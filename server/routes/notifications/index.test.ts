import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasTable: true,
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  teamFindMany: vi.fn(),
  userFindMany: vi.fn(),
  canAccessTeam: vi.fn(),
  live: true,
}));

vi.mock("../../lib/notifications.js", () => ({
  notificationStore: () => (mocks.hasTable ? { findMany: mocks.findMany, count: mocks.count, findFirst: mocks.findFirst, updateMany: mocks.updateMany } : null),
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: { team: { findMany: mocks.teamFindMany }, user: { findMany: mocks.userFindMany } },
}));
vi.mock("../teams/service.js", () => ({ canAccessTeam: mocks.canAccessTeam }));
vi.mock("../../lib/middleware.js", () => ({ authenticate: vi.fn() }));
vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => mocks.live }));

import router, { listLimit } from "./index.js";

const ID = "8d6b2769-04bd-477e-b4b5-a3e1b25db4f4";
const OTHER_ID = "2267a140-5c9a-42d0-832e-74ece775b41d";

function handler(method: "get" | "post", path: string) {
  const layer = (router as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method]);
  return layer.route.stack.at(-1).handle as (req: Request, res: Response) => Promise<void>;
}

async function call(method: "get" | "post", path: string, request: { query?: Record<string, string>; params?: Record<string, string> } = {}) {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler(method, path)({ query: {}, params: {}, ...request, user: { id: "anind", isSuperAdmin: false } } as unknown as Request, res as unknown as Response);
  return res;
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
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
  groupKey: "thread-1",
  link: "/diagrams/file-uid?thread=thread-1",
  sourceEventId: "message-1",
  payload: '{"fileName":"QA ERD","projectName":"QA"}',
  readAt: null,
  createdAt: new Date("2026-11-15T01:00:00Z"),
  ...overrides,
});

describe("notification routes (NOT-001.1)", () => {
  beforeEach(() => {
    mocks.hasTable = true;
    mocks.findMany.mockReset().mockResolvedValue([row()]);
    mocks.count.mockReset().mockResolvedValue(1);
    mocks.findFirst.mockReset().mockResolvedValue({ groupKey: null });
    mocks.updateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.teamFindMany.mockReset().mockResolvedValue([{ id: "team-1", name: "Anind's Workspace" }, { id: "team-2", name: "Old Team" }]);
    mocks.userFindMany.mockReset().mockResolvedValue([{ id: "jay", name: "Jay Test" }]);
    mocks.canAccessTeam.mockReset().mockImplementation(async (teamId: string) => teamId === "team-1");
  });

  it("lists the session user's notifications newest first with the unread count", async () => {
    const res = await call("get", "/notifications");

    expect(mocks.findMany).toHaveBeenCalledWith({ where: { recipientUserId: "anind" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 });
    expect(mocks.count).toHaveBeenCalledWith({ where: { recipientUserId: "anind", readAt: null } });
    expect(mocks.canAccessTeam).toHaveBeenCalledWith("team-1", "anind", false);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.json).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        id: ID,
        accessible: true,
        teamName: "Anind's Workspace",
        fileId: "file-uid",
        link: "/diagrams/file-uid?thread=thread-1",
        actor: { id: "jay", name: "Jay Test" },
        payload: { fileName: "QA ERD", projectName: "QA" },
      })],
      unreadCount: 1,
      live: true,
    });
  });

  it("tells the bell when this server has no live channel (NOT-001.5)", async () => {
    mocks.live = false;
    const res = await call("get", "/notifications");
    mocks.live = true;

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ live: false }));
  });

  it("filters unread rows and caps the page size", async () => {
    await call("get", "/notifications", { query: { unread: "true", limit: "500" } });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { recipientUserId: "anind", readAt: null }, take: 100 }));
    expect([listLimit(undefined), listLimit("abc"), listLimit("0"), listLimit("12.7")]).toEqual([30, 30, 30, 12]);
  });

  it("keeps only the Team name and event type for a Team the user can no longer open", async () => {
    mocks.findMany.mockResolvedValue([row({ teamId: "team-2" })]);

    const res = await call("get", "/notifications");
    const [item] = res.json.mock.calls[0][0].notifications;

    expect(item).toMatchObject({ type: "discussion.reply", teamName: "Old Team", accessible: false });
    expect(item).toMatchObject({ projectId: null, featureType: null, fileId: null, entityId: null, link: null, actor: null, payload: {} });
  });

  it("returns an empty payload when the stored payload is not a JSON object", async () => {
    mocks.findMany.mockResolvedValue([row({ teamId: null, payload: "not json", actorUserId: null })]);

    const res = await call("get", "/notifications");

    expect(res.json.mock.calls[0][0].notifications[0]).toMatchObject({ accessible: true, payload: {}, actor: null, teamName: null });
    expect(mocks.teamFindMany).not.toHaveBeenCalled();
  });

  it("marks the user's own notification read, also when it was read before", async () => {
    let res = await call("post", "/notifications/:id/read", { params: { id: ID } });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: ID, recipientUserId: "anind" }, select: { groupKey: true } });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { recipientUserId: "anind", readAt: null, id: ID }, data: { readAt: expect.any(Date) } });
    expect(res.json).toHaveBeenCalledWith({ success: true });

    mocks.updateMany.mockResolvedValue({ count: 0 });
    res = await call("post", "/notifications/:id/read", { params: { id: ID } });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it("reads every notification of the item's group, such as each reply in a thread (BUG-081)", async () => {
    mocks.findFirst.mockResolvedValue({ groupKey: "discussion:thread-1" });
    const res = await call("post", "/notifications/:id/read", { params: { id: ID } });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { recipientUserId: "anind", readAt: null, groupKey: "discussion:thread-1" }, data: { readAt: expect.any(Date) } });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it("answers a generic not-found for another user's notification and for an invalid id", async () => {
    mocks.findFirst.mockResolvedValue(null);
    let res = await call("post", "/notifications/:id/read", { params: { id: OTHER_ID } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Resource not found" });
    expect(mocks.updateMany).not.toHaveBeenCalled();

    mocks.updateMany.mockClear();
    res = await call("post", "/notifications/:id/read", { params: { id: "../other" } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("marks every unread notification of the session user read", async () => {
    mocks.updateMany.mockResolvedValue({ count: 3 });

    const res = await call("post", "/notifications/read-all");

    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { recipientUserId: "anind", readAt: null }, data: { readAt: expect.any(Date) } });
    expect(res.json).toHaveBeenCalledWith({ success: true, updated: 3 });
  });

  it("answers not-found where the database has no notifications table", async () => {
    mocks.hasTable = false;

    const res = await call("get", "/notifications");

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
