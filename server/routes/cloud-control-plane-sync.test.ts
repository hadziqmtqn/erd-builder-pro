import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  committed: false,
  published: [] as unknown[],
  insertAudit: vi.fn(),
  findTeam: vi.fn(),
  updateTeam: vi.fn(),
  findStaleMembers: vi.fn(),
  transaction: vi.fn(),
  publish: vi.fn(async (event: unknown) => {
    if (!mocks.committed) throw new Error("live sync published before transaction commit");
    mocks.published.push(event);
  }),
  tx: {
    $executeRawUnsafe: vi.fn(),
    team: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    teamMember: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../lib/config.js", () => ({ isSsoAuthMode: () => true, getCloudWebhookSecret: () => "cloud-webhook-secret" }));
vi.mock("../lib/prisma.js", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("../lib/cloud-entitlement.js", () => ({
  parseCloudEntitlement: () => ({ status: "active", revision: "entitlement-revision" }),
  serializeCloudEntitlement: (value: unknown) => value,
}));
vi.mock("../lib/team-provisioning.js", () => ({
  membershipProvisioningSignature: () => "member-signature",
  teamProvisioningSignature: () => "team-signature",
}));
vi.mock("../lib/cloud-live-sync.js", () => ({ publishCloudWorkspaceSync: mocks.publish }));
vi.mock("../lib/cloud-ai.js", () => ({ revokeCloudAiRuntimeConfig: vi.fn(), storeCloudAiEnvelope: vi.fn() }));

const router = (await import("./control-plane.js")).default;
const EVENT_ID = "9d7fdad2-d555-4aab-a917-39fb5bac9161";
const TEAM_ID = "9d7fdad2-d555-4aab-a917-39fb5bac9160";

describe("Cloud workspace webhook live sync", () => {
  let server: ReturnType<typeof createServer>;
  let endpoint: string;

  beforeEach(() => {
    mocks.committed = false;
    mocks.published.length = 0;
    mocks.transaction.mockImplementation(async (operation: (tx: typeof mocks.tx) => Promise<unknown>) => {
      mocks.committed = false;
      const result = await operation(mocks.tx);
      mocks.committed = true;
      return result;
    });
    mocks.tx.$executeRawUnsafe.mockResolvedValue(1);
    mocks.tx.team.findUnique.mockResolvedValue({ id: TEAM_ID, createdAt: new Date("2026-01-01T00:00:00Z") });
    mocks.tx.team.update.mockResolvedValue({ id: TEAM_ID });
    mocks.tx.teamMember.findMany.mockResolvedValue([]);
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.clearAllMocks();
  });

  it("publishes the event UUID as revision once, after commit", async () => {
    const app = express();
    app.use(express.json({ verify: (req, _res, body) => { (req as any).rawBody = body; } }));
    app.use("/api/control-plane", router);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Webhook test server failed to start");
    endpoint = `http://127.0.0.1:${address.port}/api/control-plane/events`;

    const body = JSON.stringify({
      id: EVENT_ID,
      type: "cloud.workspace.sync",
      data: { organization: { id: "9d7fdad2-d555-4aab-a917-39fb5bac9162", name: "Team", status: "active", entitlement: {}, members: [] } },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", "cloud-webhook-secret").update(`${timestamp}.${body}`).digest("hex")}`;
    const send = () => fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ERDBPro-Event-Id": EVENT_ID,
        "X-ERDBPro-Timestamp": timestamp,
        "X-ERDBPro-Signature": signature,
      },
      body,
    });

    const first = await send();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ accepted: true, duplicate: false });
    expect(mocks.published).toEqual([{ teamId: TEAM_ID, eventType: "cloud.workspace.sync", revision: EVENT_ID }]);

    mocks.tx.$executeRawUnsafe.mockResolvedValue(0);
    const duplicate = await send();
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ accepted: true, duplicate: true });
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
});
