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

  it("returns the root marker summary with exact unread message counts", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: 'Project' }];
      if (query.includes('JOIN "projects" p')) return [{ id: 42, uid: 'file-a', projectId: 7, label: 'ERD' }];
      if (query.includes('COUNT(m."id")')) return [{ anchorType: 'table', anchorId: 'entity-a', status: 'resolved', messageCount: 5n, unreadCount: 2n }];
      if (query.includes('ROW_NUMBER()')) return [{ anchorType: 'table', anchorId: 'entity-a', authorId: 'member-a', authorName: 'Member A', body: 'First', createdAt: '2026-09-28T00:00:00Z' }];
      return [];
    });
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/markers?feature_type=diagram&file_id=file-a`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ markers: [{ anchorType: 'table', anchorId: 'entity-a', status: 'resolved', messageCount: 5, unreadCount: 2, replyCount: 4, rootMessage: { anchorType: 'table', anchorId: 'entity-a', authorId: 'member-a', authorName: 'Member A', body: 'First', createdAt: '2026-09-28T00:00:00Z' } }] });
      const rootQuery = mocks.queryRaw.mock.calls.find(([query]) => String(query).includes('ROW_NUMBER()'))?.[0];
      expect(String(rootQuery)).toContain('ORDER BY m."created_at" ASC');
      expect(String(rootQuery)).not.toContain('"rank" <= 3');
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
    const contextInsert = mocks.executeRaw.mock.calls.find(([query]) => String(query).includes('INSERT INTO "discussion_contexts"'))?.[0];
    expect(String(contextInsert)).toContain('("id", "thread_id", "feature_type", "file_id")');
    expect(String(contextInsert)).not.toContain('"anchor_type"');
    expect(String(contextInsert)).not.toContain('"anchor_id"');
    expect(String(contextInsert)).not.toContain('"anchor_label"');
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

  it("rejects an ERD object anchor on a Discussion because anchors belong to Comments", async () => {
    mocks.queryRaw.mockImplementation(async (query: string, ...values: unknown[]) => {
      if (query.includes('JOIN "projects"')) return [{ id: 42, projectId: 7 }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Should users be soft deleted?", context: { type: "table", id: "entity-1" } }),
      });
      expect(response.status).toBe(404);
    });

    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
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
      if (query.includes("LEFT JOIN LATERAL")) return [];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes("COUNT(*)")) return [{ count: 0 }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions?scope=project&feature_type=diagram&file_id=diagram-uid`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ threads: [], unreadCount: 0, scope: "project" });
    });
  });

  it("rejects partial comment anchor filters instead of returning every file comment", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments?feature_type=diagram&file_id=diagram-uid&anchor_type=table`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid comment anchor" });
    });
    expect(mocks.queryRaw.mock.calls.every(([query]) => !String(query).includes('FROM "comment_threads" t'))).toBe(true);
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
    expect(mocks.executeRaw).toHaveBeenCalledTimes(4);
    expect(mocks.executeRaw.mock.calls[0][0]).toContain('UPDATE "diagrams" SET "updated_at" = "updated_at"');
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("rejects Comment anchors that do not belong to an ERD", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments?feature_type=diagram&file_id=diagram-uid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Orphan marker", context: { type: "shape", id: "shape-1" } }),
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Resource not found" });
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("locks the file row before checking whether the anchor already has a comment thread", async () => {
    const operations: string[] = [];
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "entities"')) return [{ label: "users" }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      if (query.includes('FROM "comment_threads"') && query.includes('ORDER BY')) {
        operations.push("check-anchor");
        return [];
      }
      return [];
    });
    mocks.executeRaw.mockImplementation(async (query: string) => {
      if (query.includes('UPDATE "diagrams" SET "updated_at" = "updated_at"')) operations.push("lock-file");
      return 1;
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments?feature_type=diagram&file_id=diagram-uid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "A comment", context: { type: "table", id: "entity-1" } }),
      });
      expect(response.status).toBe(201);
    });

    expect(operations).toEqual(["lock-file", "check-anchor"]);
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

    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.executeRaw.mock.calls[0][0]).toContain('UPDATE "diagrams" SET "updated_at" = "updated_at"');
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("does not save a comment or reply if Resolve wins the write race", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "entities"')) return [{ label: "users" }];
      if (query.includes('FROM "users"')) return [{ name: "Member A", email: "member@example.test" }];
      if (query.includes('FROM "comment_threads"')) return [{ id: "thread-1", status: "open" }];
      return [];
    });
    mocks.executeRaw.mockImplementation(async (query: string) => query.includes('SET "updated_at" = CURRENT_TIMESTAMP') ? 0 : 1);

    await withServer(async (url) => {
      const comment = await fetch(`${url}/api/projects/7/comments?feature_type=diagram&file_id=diagram-uid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Concurrent comment", context: { type: "table", id: "entity-1" } }),
      });
      expect(comment.status).toBe(409);

      const reply = await fetch(`${url}/api/projects/7/comments/thread-1/messages?feature_type=diagram&file_id=diagram-uid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Concurrent reply" }),
      });
      expect(reply.status).toBe(409);
    });

    expect(mocks.executeRaw.mock.calls).toHaveLength(3);
    expect(mocks.executeRaw.mock.calls[0][0]).toContain('UPDATE "diagrams" SET "updated_at" = "updated_at"');
    expect(mocks.executeRaw.mock.calls.slice(1).every(([query]) => String(query).includes('SET "updated_at" = CURRENT_TIMESTAMP') && String(query).includes('"status" = \'open\''))).toBe(true);
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

  it("loads the latest page of comment history for one ERD anchor", async () => {
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

  it("bounds anchor history and returns a stable cursor for older messages", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `message-${index}`,
      threadId: "thread-1",
      authorId: "member-a",
      authorName: "Member A",
      body: `Message ${index}`,
      createdAt: new Date((51 - index) * 1000).toISOString(),
    }));
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "comment_threads" t')) return [{ id: "thread-1", anchorLabel: "users", status: "open" }];
      if (query.includes('FROM "comment_messages" m')) return rows;
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/anchor?feature_type=diagram&file_id=diagram-uid&anchor_type=table&anchor_id=entity-1`);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.messages).toHaveLength(50);
      expect(data.hasMore).toBe(true);
      expect(data.nextCursor).toEqual({ createdAt: new Date(2000).toISOString(), id: "message-49" });
      expect(mocks.queryRaw.mock.calls.find(([query]) => String(query).includes('FROM "comment_messages" m'))?.[0]).toContain("LIMIT 51");

      const cursor = new URLSearchParams({ before_created_at: data.nextCursor.createdAt, before_id: data.nextCursor.id });
      const older = await fetch(`${url}/api/projects/7/comments/anchor?feature_type=diagram&file_id=diagram-uid&anchor_type=table&anchor_id=entity-1&${cursor}`);
      expect(older.status).toBe(200);
      const cursorQuery = mocks.queryRaw.mock.calls.find(([query]) => String(query).includes('FROM "comment_messages" m') && String(query).includes('m."created_at" < $7'));
      expect(cursorQuery?.[7]).toEqual(new Date(data.nextCursor.createdAt));
      expect(cursorQuery?.[8]).toBe(data.nextCursor.id);
    });
  });

  it("rejects malformed message history cursors", async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/anchor?feature_type=diagram&file_id=diagram-uid&anchor_type=table&anchor_id=entity-1&before_id=message-1`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid message cursor" });
    });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("rejects an invalid comment anchor before querying its history", async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/anchor?feature_type=diagram&file_id=diagram-uid&anchor_type=general&anchor_id=entity-1`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid comment anchor" });
    });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("rejects stale thread status changes instead of overwriting a newer status", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('SELECT t."status"') && query.includes('FROM "discussion_threads"')) return [{ status: "resolved" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", expectedStatus: "open" }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Thread status changed. Refresh before trying again." });
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("keeps legacy status requests safe with an atomic expected-state update", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('SELECT t."status"') && query.includes('FROM "discussion_threads"')) return [{ status: "open" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "resolved" });
    });

    const [query, ...values] = mocks.executeRaw.mock.calls[0];
    expect(query).toContain('AND t."status" = $4');
    expect(values.slice(-3)).toEqual(["open", "resolved", "member-a"]);
  });

  it("loads only the latest page of a Discussion thread", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `message-${index}`,
      authorId: "member-a",
      authorName: "Member A",
      body: `Message ${index}`,
      createdAt: new Date((51 - index) * 1000).toISOString(),
    }));
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('SELECT t."id"') && query.includes('FROM "discussion_threads" t')) return [{ id: "thread-1" }];
      if (query.includes('FROM "discussion_messages" m')) return rows;
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1`);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.messages).toHaveLength(50);
      expect(data.hasMore).toBe(true);
      expect(data.nextCursor.id).toBe("message-49");
      expect(mocks.queryRaw.mock.calls.find(([query]) => String(query).includes('FROM "discussion_messages" m'))?.[0]).toContain("LIMIT 51");
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
        body: JSON.stringify({ body: "Updated comment", expectedBody: "Original comment" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: "message-1", body: "Updated comment" });
    });
    expect(mocks.executeRaw).toHaveBeenCalled();
    expect(mocks.executeRaw.mock.calls[0][0]).toContain('AND m."body" = $9');
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("rejects a stale edit instead of overwriting a newer message body", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('SELECT m."id", m."body"') && query.includes('FROM "comment_messages" m')) return [{ id: "message-1", body: "Newer text" }];
      return [];
    });
    mocks.executeRaw.mockImplementation(async (query: string) => query.includes('UPDATE "comment_messages"') ? 0 : 1);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/thread-1/messages/message-1?feature_type=diagram&file_id=diagram-uid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Stale edit", expectedBody: "Original text" }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "This message changed. Refresh before editing it again." });
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("edits a Discussion message without querying Comment-only thread columns", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1/messages/message-1?feature_type=diagram&file_id=diagram-uid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Updated discussion", expectedBody: "Original discussion" }),
      });
      expect(response.status).toBe(200);
    });

    const update = String(mocks.executeRaw.mock.calls[0][0]);
    expect(update).toContain('UPDATE "discussion_messages"');
    expect(update).toContain('AND m."body" = $7');
    expect(update).not.toContain('t."feature_type"');
    expect(update).not.toContain('t."file_id"');
  });

  it("deletes a Discussion message only for its author and publishes the change", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1/messages/message-1`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedBody: "Original discussion" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, id: "message-1" });
    });

    const deletion = mocks.executeRaw.mock.calls.find(([query]) => String(query).includes('DELETE FROM "discussion_messages"'));
    expect(deletion?.[0]).toContain('"author_id" = $3');
    expect(deletion?.[0]).toContain('"body" = $4');
    expect(deletion?.[0]).toContain('t."project_id" = $5 AND t."team_id" = $6');
    expect(deletion?.slice(1)).toEqual(["message-1", "thread-1", "member-a", "Original discussion", 7, "team-a"]);
    expect(mocks.executeRaw).toHaveBeenCalledWith(expect.stringContaining('UPDATE "discussion_threads"'), "thread-1", 7, "team-a");
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("rejects a stale Discussion message delete", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "discussion_messages" m')) return [{ id: "message-1" }];
      return [];
    });
    mocks.executeRaw.mockImplementation(async (query: string) => query.includes('DELETE FROM "discussion_messages"') ? 0 : 1);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1/messages/message-1`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedBody: "Old discussion" }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "This message changed. Refresh before deleting it again." });
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("returns generic not-found when the Discussion message is outside the author's scope", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      return [];
    });
    mocks.executeRaw.mockImplementation(async (query: string) => query.includes('DELETE FROM "discussion_messages"') ? 0 : 1);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1/messages/message-1`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedBody: "Someone else's message" }),
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Resource not found" });
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("keeps the legacy file Discussion edit constrained through its context table", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('JOIN "projects"')) return [{ id: 42, uid: "diagram-uid", projectId: 7, projectName: "Workspace", label: "ERD" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions/thread-1/messages/message-1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Updated discussion", expectedBody: "Original discussion" }),
      });
      expect(response.status).toBe(200);
    });

    const update = String(mocks.executeRaw.mock.calls[0][0]);
    expect(update).toContain('EXISTS (SELECT 1 FROM "discussion_contexts"');
    expect(update).not.toContain('t."feature_type"');
  });

  it("marks a Discussion thread deletable only for its creator", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('SELECT t."id"') && query.includes('FROM "discussion_threads" t')) return [{ id: "thread-1", status: "open", fileName: "Test ERD", canDelete: true }];
      if (query.includes("COUNT(*)")) return [{ count: 0 }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions?scope=project`);
      expect(response.status).toBe(200);
      expect((await response.json()).threads[0]).toEqual(expect.objectContaining({ canDelete: true, fileName: "Test ERD" }));
    });
    const query = String(mocks.queryRaw.mock.calls.find(([candidate]) => String(candidate).includes('FROM "discussion_threads" t'))?.[0]);
    expect(query).toContain('(t."created_by" = $3) AS "canDelete"');
    expect(query).toContain('"fileName"');
    expect(query).not.toContain('c0."anchor_type"');
    expect(query).not.toContain('c0."anchor_id"');
  });

  it("deletes a Discussion thread only when the active member created it", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => query.includes('FROM "projects" p') ? [{ id: 7, name: "Workspace" }] : []);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1`, { method: "DELETE" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
    expect(mocks.executeRaw).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM "discussion_threads"'), "thread-1", 7, "team-a", "member-a");
    expect(mocks.executeRaw.mock.calls[0][0]).toContain('AND "created_by" = $4');
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("returns generic not-found when a Discussion thread is not owned by the active member", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => query.includes('FROM "projects" p') ? [{ id: 7, name: "Workspace" }] : []);
    mocks.executeRaw.mockResolvedValue(0);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1`, { method: "DELETE" });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Resource not found" });
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("deletes a comment thread only when the active member created it", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      return [];
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/thread-1?feature_type=diagram&file_id=diagram-uid`, { method: "DELETE" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
    expect(mocks.executeRaw).toHaveBeenCalledWith(
      expect.stringContaining('AND "created_by" = $4'),
      "thread-1", 7, "team-a", "member-a", "diagram", "42",
    );
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-a" }));
  });

  it("returns generic not-found when an atomic thread delete does not match its creator scope", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      return [];
    });
    mocks.executeRaw.mockResolvedValue(0);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/comments/thread-1?feature_type=diagram&file_id=diagram-uid`, { method: "DELETE" });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Resource not found" });
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("locks a Discussion thread before deduplicating a concurrently added file context", async () => {
    const operations: string[] = [];
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "discussion_threads" t')) return [{ id: "thread-1" }];
      return [];
    });
    mocks.executeRaw.mockImplementation(async (query: string) => {
      if (query.includes('UPDATE "discussion_threads" SET "updated_at" = "updated_at"')) operations.push("lock-thread");
      if (query.includes('INSERT INTO "discussion_contexts"')) operations.push("insert-context");
      return 1;
    });

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: { featureType: "diagram", fileId: "diagram-uid", type: "general" } }),
      });
      expect(response.status).toBe(201);
    });
    expect(operations).toEqual(["lock-thread", "insert-context"]);
    expect(String(mocks.executeRaw.mock.calls[0][0])).toContain('AND "status" = \'open\'');
    expect(String(mocks.executeRaw.mock.calls[1][0])).not.toContain('"anchor_type"');
    expect(String(mocks.executeRaw.mock.calls[1][0])).not.toContain('"anchor_id"');
    expect(String(mocks.executeRaw.mock.calls[1][0])).not.toContain('"anchor_label"');
  });

  it("does not add context after a Discussion has been resolved", async () => {
    mocks.queryRaw.mockImplementation(async (query: string) => {
      if (query.includes('FROM "projects" p') && !query.includes('JOIN "projects"')) return [{ id: 7, name: "Workspace" }];
      if (query.includes('FROM "diagrams" f')) return [{ id: 42, uid: "diagram-uid", projectId: 7, label: "ERD" }];
      if (query.includes('FROM "discussion_threads" t')) return [{ id: "thread-1" }];
      return [];
    });
    mocks.executeRaw.mockResolvedValue(0);

    await withServer(async (url) => {
      const response = await fetch(`${url}/api/projects/7/discussions/thread-1/contexts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: { featureType: "diagram", fileId: "diagram-uid", type: "general" } }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Reopen this thread before adding context" });
    });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
