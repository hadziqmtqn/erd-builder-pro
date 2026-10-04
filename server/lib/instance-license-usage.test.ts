import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localPostgres: true,
  teamCount: vi.fn(async () => 2),
  members: vi.fn(async () => [{ userId: "user-1" }, { userId: "user-2" }]),
}));

vi.mock("./config.js", () => ({ isLocalPostgres: () => mocks.localPostgres }));
vi.mock("./prisma.js", () => ({
  prisma: {
    team: { count: mocks.teamCount },
    teamMember: { findMany: mocks.members },
  },
}));

const { instanceLicenseUsage } = await import("./instance-license-usage.js");

beforeEach(() => vi.clearAllMocks());

describe("instance license usage", () => {
  it("counts distinct active members only in active Teams", async () => {
    await expect(instanceLicenseUsage()).resolves.toEqual({ teamCount: 2, memberCount: 2 });
    expect(mocks.teamCount).toHaveBeenCalledWith({ where: { type: { not: "personal" }, status: "active" } });
    expect(mocks.members).toHaveBeenCalledWith({
      where: { status: "active", team: { type: { not: "personal" }, status: "active" } },
      select: { userId: true },
      distinct: ["userId"],
    });
  });

  it("returns no Team usage when instance Teams are unavailable", async () => {
    mocks.localPostgres = false;
    await expect(instanceLicenseUsage()).resolves.toEqual({ teamCount: 0, memberCount: 0 });
    expect(mocks.teamCount).not.toHaveBeenCalled();
    mocks.localPostgres = true;
  });
});
