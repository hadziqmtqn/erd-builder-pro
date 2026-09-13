import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("./config.js", () => ({
  getCloudAiEncryptionKey: () => "",
  isSsoAuthMode: () => true,
}));
vi.mock("./middleware.js", () => ({ authenticate: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: { team: { findUnique: mocks.findUnique } } }));
vi.mock("./team-scope.js", () => ({ currentTeamScope: () => ({ mode: "team", teamId: "team-1" }) }));

import { requireCloudAiAccess } from "./cloud-ai.js";

const entitlement = (capabilities: Record<string, boolean>) => JSON.stringify({
  product_type: "cloud",
  revision: "a".repeat(64),
  capabilities,
  limits: { max_members: 5, ai_credits: 100 },
});

describe("Cloud AI access", () => {
  beforeEach(() => mocks.findUnique.mockReset());

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
});
