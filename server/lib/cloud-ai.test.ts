import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  teamCount: vi.fn(),
  memberCount: vi.fn(),
  projectCount: vi.fn(),
  diagramCount: vi.fn(),
  noteCount: vi.fn(),
  drawingCount: vi.fn(),
  flowchartCount: vi.fn(),
  ssoMode: true,
  encryptionKey: "test-secret",
  machineConfig: {
    issuerUrl: "https://account.example.com",
    clientId: "cloud-machine",
    clientSecret: "machine-secret",
  },
  telemetryConfig: {
    issuerUrl: "https://account.example.com",
    clientId: "telemetry-machine",
    clientSecret: "telemetry-secret",
    deploymentId: "33333333-3333-4333-8333-333333333333",
    tenantRef: "opaque-tenant",
    version: "3.4.6",
  },
}));

vi.mock("./config.js", () => ({
  getCloudAiEncryptionKey: () => mocks.encryptionKey,
  getCloudAiMachineConfig: () => mocks.machineConfig,
  getCloudTelemetryConfig: () => mocks.telemetryConfig,
  isSsoAuthMode: () => mocks.ssoMode,
}));
vi.mock("./middleware.js", () => ({ authenticate: vi.fn() }));
vi.mock("./prisma.js", () => ({
  prisma: {
    teamMember: { count: mocks.memberCount },
    project: { count: mocks.projectCount },
    diagram: { count: mocks.diagramCount },
    note: { count: mocks.noteCount },
    drawing: { count: mocks.drawingCount },
    flowchart: { count: mocks.flowchartCount },
    team: { findUnique: mocks.findUnique, count: mocks.teamCount },
    $queryRawUnsafe: mocks.queryRaw,
    $executeRawUnsafe: mocks.executeRaw,
    $transaction: mocks.transaction,
  },
}));
vi.mock("./team-scope.js", () => ({ currentTeamScope: () => ({ mode: "team", teamId: "team-1" }) }));

import { pruneCloudAiUsage, refreshCloudAiRuntimeConfig, requireCloudAiAccess } from "./cloud-ai.js";
import { sendCloudTelemetryHeartbeat } from "./cloud-telemetry.js";

const entitlement = (capabilities: Record<string, boolean>) => JSON.stringify({
  product_type: "cloud",
  revision: "a".repeat(64),
  capabilities,
  limits: { max_members: 5, ai_credits: 100 },
});

describe("Cloud AI access", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.queryRaw.mockReset();
    mocks.executeRaw.mockReset();
    mocks.transaction.mockReset();
    mocks.teamCount.mockReset();
    mocks.memberCount.mockReset();
    mocks.projectCount.mockReset();
    mocks.diagramCount.mockReset();
    mocks.noteCount.mockReset();
    mocks.drawingCount.mockReset();
    mocks.flowchartCount.mockReset();
    mocks.ssoMode = true;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("rejects an active Team without the AI capability", async () => {
    mocks.findUnique.mockResolvedValue({ status: "active", cloudEntitlement: entitlement({ erd_builder: true }) });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    requireCloudAiAccess({ user: { id: "user-1" } } as any, res, next);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CLOUD_AI_QUOTA_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("allows an active Team with the AI capability and credits", async () => {
    mocks.findUnique.mockResolvedValue({ status: "active", cloudEntitlement: entitlement({ ai_assistant: true }) });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    requireCloudAiAccess({ user: { id: "user-1" } } as any, res, next);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("pulls the encrypted configuration with a separate machine credential", async () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(mocks.encryptionKey).digest(), iv);
    const plaintext = JSON.stringify({
      provider_code: "openai",
      model_identifier: "gpt-4o-mini",
      base_url: "https://api.openai.com/v1",
      api_key: "sk-secret",
      global_system_prompt: "Use DBML.",
      enabled: true,
      revision: 2,
      expires_at: null,
    });
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const envelope = {
      version: 1,
      revision: 2,
      expires_at: null,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    const response = (payload: unknown, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(payload),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ access_token: "machine-token", expires_in: 3600 }))
      .mockResolvedValueOnce(response({ data: { envelope } }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.executeRaw.mockResolvedValue(1);

    await expect(refreshCloudAiRuntimeConfig()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://account.example.com/oauth/token");
    expect(fetchMock.mock.calls[1][0]).toBe("https://account.example.com/api/v1/cloud/ai-config");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer machine-token");
    expect(mocks.executeRaw).toHaveBeenCalled();
  });

  it("does not contact SaaS outside Cloud SSO mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.ssoMode = false;

    await expect(refreshCloudAiRuntimeConfig()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prunes only terminal Cloud AI usage and completed periods", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $executeRawUnsafe: mocks.executeRaw,
    }));
    mocks.executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    await expect(pruneCloudAiUsage(new Date("2026-09-14T12:00:00Z"))).resolves.toEqual({ requests: 2, periods: 1 });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.executeRaw.mock.calls[0][0]).toContain("state\" IN ('consumed', 'released', 'rejected')");
    expect(mocks.executeRaw.mock.calls[1][0]).toContain("reserved_credits\" = 0");
    expect(mocks.executeRaw.mock.calls[1][0]).toContain("NOT EXISTS");
  });

  it("does not prune Cloud AI usage outside Cloud SSO mode", async () => {
    mocks.ssoMode = false;

    await expect(pruneCloudAiUsage(new Date("2026-09-14T12:00:00Z"))).resolves.toEqual({ requests: 0, periods: 0 });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("sends only aggregate telemetry in Cloud SSO mode", async () => {
    const response = (payload: unknown, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(payload),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ access_token: "telemetry-token", expires_in: 3600 }))
      .mockResolvedValueOnce(response({ accepted: true, updated: true }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.teamCount.mockResolvedValue(2);
    mocks.memberCount.mockResolvedValue(5);
    mocks.projectCount.mockResolvedValue(3);
    mocks.diagramCount.mockResolvedValue(2);
    mocks.noteCount.mockResolvedValue(3);
    mocks.drawingCount.mockResolvedValue(1);
    mocks.flowchartCount.mockResolvedValue(3);

    await expect(sendCloudTelemetryHeartbeat()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body.toString()).toContain("scope=cloud%3Atelemetry");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      deployment_id: mocks.telemetryConfig.deploymentId,
      aggregate: { teams: 2, members: 5, projects: 3, files: 9 },
    });
    expect(fetchMock.mock.calls[1][1].body).not.toContain("document");
  });
});
