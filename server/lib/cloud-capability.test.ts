import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("./config.js", () => ({ isSsoAuthMode: () => true }));
vi.mock("./team-scope.js", () => ({ currentTeamScope: () => ({ mode: "team", teamId: "team-1" }) }));
vi.mock("./prisma.js", () => ({ prisma: { team: { findUnique: mocks.findUnique } } }));

const { hasCloudCapability, requireCloudCapability } = await import("./cloud-capability.js");

const entitlement = JSON.stringify({
  revision: "a".repeat(64),
  capabilities: { erd_builder: true, notes: false },
  limits: { max_members: 5 },
});

describe("Cloud feature capability", () => {
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
});
