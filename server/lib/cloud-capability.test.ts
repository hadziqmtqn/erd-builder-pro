import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  isSsoAuthMode: vi.fn(() => true),
  currentTeamScope: vi.fn(() => ({ mode: "team", teamId: "team-1" })),
}));

vi.mock("./config.js", () => ({ isSsoAuthMode: mocks.isSsoAuthMode }));
vi.mock("./team-scope.js", () => ({ currentTeamScope: mocks.currentTeamScope }));
vi.mock("./prisma.js", () => ({ prisma: { team: { findUnique: mocks.findUnique } } }));

const { hasCloudCapability, requireCloudCapability } = await import("./cloud-capability.js");

const entitlement = JSON.stringify({
  revision: "a".repeat(64),
  capabilities: { erd_builder: true, notes: false },
  limits: { max_members: 5 },
});

describe("Cloud feature capability", () => {
  afterEach(() => {
    mocks.findUnique.mockReset();
    mocks.isSsoAuthMode.mockReturnValue(true);
    mocks.currentTeamScope.mockReturnValue({ mode: "team", teamId: "team-1" });
  });

  it("reads existing stored grants without a migration", () => {
    expect(hasCloudCapability(entitlement, "active", "erd_builder")).toBe(true);
    expect(hasCloudCapability(entitlement, "active", "notes")).toBe(false);
  });

  it("fails closed when an active Team plan does not include the feature", async () => {
    mocks.findUnique.mockResolvedValue({ status: "active", cloudEntitlement: entitlement });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await requireCloudCapability("notes")({} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CLOUD_CAPABILITY_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when the Team is locked even if the stored capability is enabled", async () => {
    mocks.findUnique.mockResolvedValue({ status: "locked", cloudEntitlement: entitlement });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await requireCloudCapability("erd_builder")({} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CLOUD_CAPABILITY_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("does not apply Cloud Team gating to Personal or Self-host requests", async () => {
    const personalResponse = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const personalNext = vi.fn();
    mocks.currentTeamScope.mockReturnValue({ mode: "personal", teamId: null });

    await requireCloudCapability("notes")({} as any, personalResponse, personalNext);

    mocks.isSsoAuthMode.mockReturnValue(false);
    const selfHostResponse = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const selfHostNext = vi.fn();

    await requireCloudCapability("notes")({} as any, selfHostResponse, selfHostNext);

    expect(personalNext).toHaveBeenCalledOnce();
    expect(selfHostNext).toHaveBeenCalledOnce();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a grant issued for another product family", () => {
    expect(hasCloudCapability(JSON.stringify({
      product_type: "self_host",
      revision: "a".repeat(64),
      capabilities: { erd_builder: true },
      limits: { max_members: 5 },
    }), "active", "erd_builder")).toBe(false);
  });
});
