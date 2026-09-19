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
  it("counts active members once even when they belong to multiple Teams", async () => {
    await expect(instanceLicenseUsage()).resolves.toEqual({ teamCount: 2, memberCount: 2 });
    expect(mocks.members).toHaveBeenCalledWith({
      where: { status: "active" },
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
