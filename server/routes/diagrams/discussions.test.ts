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

const { default: discussionsRouter, requireCloudDiscussionTeam } = await import("./discussions.js");

async function withServer(run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "member-a", email: "member@example.test" };
    next();
  });
  app.use("/api/diagrams/:uid/discussions", requireCloudDiscussionTeam, discussionsRouter);
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

  it("denies Personal scope and Self-host before querying discussion data", async () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    mocks.scope = { mode: "personal", teamId: null };
    requireCloudDiscussionTeam({} as any, response, next);
    expect(response.status).toHaveBeenLastCalledWith(404);
    expect(next).not.toHaveBeenCalled();

    mocks.scope = { mode: "team", teamId: "team-a" };
    mocks.ssoMode = false;
    requireCloudDiscussionTeam({} as any, response, next);
    expect(response.status).toHaveBeenLastCalledWith(404);
    expect(next).not.toHaveBeenCalled();
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

  it("creates a General thread transactionally and publishes metadata", async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/diagrams/diagram-uid/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Should sessions expire after 24 hours?", anchorType: "general" }),
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
});
