import { createServer } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: true,
  scope: { mode: "team" as "team" | "personal", teamId: "team-a" as string | null },
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({ isSsoAuthMode: () => mocks.ssoMode }));
vi.mock("../../lib/team-scope.js", () => ({ currentTeamScope: () => mocks.scope }));
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mocks.queryRaw(...args),
    $executeRawUnsafe: (...args: unknown[]) => mocks.executeRaw(...args),
    $transaction: (callback: (tx: unknown) => unknown) => mocks.transaction(callback),
  },
}));
vi.mock("../../lib/cloud-live-sync.js", () => ({ publishCloudWorkspaceSync: mocks.publish }));

const { default: discussionsRouter, requireCloudDiscussionTeam, setCollaborationResource } = await import("./discussions.js");

async function withServer(run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "member-a", email: "member@example.test" };
    next();
  });
  app.use("/api/diagrams/:uid/discussions", requireCloudDiscussionTeam, discussionsRouter);
  app.use("/api/projects/:projectId/discussions", requireCloudDiscussionTeam, setCollaborationResource("discussion"), discussionsRouter);
  app.use("/api/projects/:projectId/comments", requireCloudDiscussionTeam, setCollaborationResource("comment"), discussionsRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("Cloud ERD discussions scope", () => {
  beforeEach(() => {
    mocks.ssoMode = true;
    mocks.scope = { mode: "team", teamId: "team-a" };
    mocks.queryRaw.mockReset();
    mocks.executeRaw.mockReset();
    mocks.transaction.mockReset();
    mocks.publish.mockReset();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback({
      $queryRawUnsafe: (...args: unknown[]) => mocks.queryRaw(...args),
      $executeRawUnsafe: (...args: unknown[]) => mocks.executeRaw(...args),
    }));
    mocks.queryRaw.mockImplementation(async (query: string, ...values: unknown[]) => {
      if (query.includes('JOIN "projects"')) return values[1] === "team-a" ? [{ id: 42, projectId: 7 }] : [];
      if (query.includes("LEFT JOIN LATERAL")) return [];
      if (query.includes("COUNT(*)")) return [{ count: 0 }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      return [];
    });
    mocks.executeRaw.mockResolvedValue(1);
  });

  afterEach(() => vi.restoreAllMocks());

  it("denies Personal scope and allows a Team-scoped Self-host request", async () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    mocks.scope = { mode: "personal", teamId: null };
    requireCloudDiscussionTeam({} as any, response, next);
    expect(response.status).toHaveBeenLastCalledWith(404);
    expect(next).not.toHaveBeenCalled();

    mocks.scope = { mode: "team", teamId: "team-a" };
    mocks.ssoMode = false;
    requireCloudDiscussionTeam({} as any, response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("returns a generic 404 when the ERD does not belong to the active Team", async () => {
    mocks.scope = { mode: "team", teamId: "team-b" };
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Resource not found" });
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw.mock.calls[0][2]).toBe("team-b");
  });

  it("lists a Team ERD's threads and unread count", async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ threads: [], unreadCount: 0 });
    });
    expect(mocks.queryRaw.mock.calls[0][2]).toBe("team-a");
  });

  it("returns only marker summaries with exact unread message counts", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: 'Project' }];
      if (query.includes('JOIN "projects" p')) return [{ id: 42, uid: 'file-a', projectId: 7, label: 'ERD' }];
      if (query.includes('COUNT(m."id")')) return [{ anchorType: 'table', anchorId: 'entity-a', status: 'resolved', messageCount: 5n, unreadCount: 2n }];
      if (query.includes('ROW_NUMBER()')) return [{ anchorType: 'table', anchorId: 'entity-a', authorName: 'Member A', body: 'Latest', createdAt: '2026-09-29T00:00:00Z' }];
      return [];
    });
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/markers?feature_type=diagram&file_id=file-a`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ markers: [{ anchorType: 'table', anchorId: 'entity-a', status: 'resolved', messageCount: 5, unreadCount: 2, previewMessages: [{ anchorType: 'table', anchorId: 'entity-a', authorName: 'Member A', body: 'Latest', createdAt: '2026-09-29T00:00:00Z' }] }] });
      expect(mocks.queryRaw.mock.calls.some(([query]) => String(query).includes('ROW_NUMBER()'))).toBe(true);
    });
  });

  it("creates a General thread transactionally and publishes metadata", async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Should sessions expire after 24 hours?" }),
      });
      expect(response.status).toBe(201);
      expect((await response.json()).id).toBeTruthy();
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.executeRaw).toHaveBeenCalledTimes(4);
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({
      teamId: "team-a",
      eventType: "cloud.workspace.sync",
    }));
  });

  it("accepts the legacy anchor payload while clients roll forward", async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Legacy client payload", anchorType: "general" }),
      });
      expect(response.status).toBe(201);
    });
  });

  it("derives a table anchor from the frontend context trigger", async () => {
    mocks.queryRaw.mockImplementation(async (query: string, ...values: unknown[]) => {
      if (query.includes('JOIN "projects"')) return [{ id: 42, projectId: 7 }];
      if (query.includes('FROM "entities"')) return [{ label: "users" }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Should users be soft deleted?", context: { type: "table", id: "entity-1" } }),
      });
      expect(response.status).toBe(201);
    });

    expect(mocks.executeRaw.mock.calls[1]).toEqual(expect.arrayContaining(["table", "entity-1", "users"]));
  });

  it("rejects replies to resolved discussions", async () => {
    mocks.queryRaw.mockImplementation(async (query: string, ...values: unknown[]) => {
      if (query.includes('JOIN "projects"')) return [{ id: 42, projectId: 7 }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      if (query.includes('"status"')) return [{ status: "resolved" }];
      return [];
    });
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions/thread-1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "I have another thought." }),
      });
      expect(response.status).toBe(409);
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("lists project discussions across the active file boundary", async () => {
    mocks.queryRaw.mockImplementation(async (query: string, ...values: unknown[]) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes("LEFT JOIN LATERAL")) return [];
      if (query.includes("COUNT(*)")) return [{ count: 0 }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions?scope=project&feature_type=diagram&file_id=diagram-uid`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ threads: [], unreadCount: 0, scope: "project" });
    });
  });

  it("creates a contextual Comment without using client team scope as authorization", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "entities"')) return [{ label: "users" }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "Should this table have a tenant key?",
          context: { featureType: "diagram", fileId: "diagram-uid", type: "table", id: "entity-1" },
        }),
      });
      expect(response.status).toBe(201);
      expect((await response.json()).kind).toBe("comment");
    });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(3);
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("blocks creating comments on a resolved anchor until the thread is reopened", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "entities"')) return [{ label: "users" }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      if (query.includes('FROM "comment_threads"')) return [{ id: "thread-1", status: "resolved" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments?feature_type=diagram&file_id=diagram-uid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Add a comment", context: { type: "table", id: "entity-1" } }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Reopen this thread before commenting" });
    });

    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("keeps Comment thread endpoints scoped to the active file", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/thread-1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Missing file context" }),
      });
      expect(response.status).toBe(404);
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("loads the full comment history for one ERD anchor", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "comment_threads" t')) return [{
        id: "thread-1", featureType: "diagram", fileId: "42", anchorType: "table", anchorId: "entity-1", anchorLabel: "users", status: "open",
      }];
      if (query.includes('FROM "comment_messages" m')) return [{
        id: "message-1", threadId: "thread-1", authorId: "member-a", authorName: "Member A", body: "Keep this table tenant-scoped.", createdAt: "2026-09-29T10:00:00.000Z",
      }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/anchor?feature_type=diagram&file_id=diagram-uid&anchor_type=table&anchor_id=entity-1`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        messages: [expect.objectContaining({ id: "message-1", body: "Keep this table tenant-scoped." })],
        threads: [expect.objectContaining({ id: "thread-1", anchorId: "entity-1" })],
      });
    });
  });

  it("allows a comment author to edit only their own message", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/thread-1/messages/message-1?feature_type=diagram&file_id=diagram-uid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Updated comment" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: "message-1", body: "Updated comment" });
    });
    expect(mocks.executeRaw).toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("deletes a comment thread only when the active member created it", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "comment_threads" t')) return [{ createdBy: "member-a" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/thread-1?feature_type=diagram&file_id=diagram-uid`, { method: "DELETE" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
    expect(mocks.executeRaw).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM "comment_threads"'), "thread-1");
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });
});
