import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localPostgres: true,
  teamFindMany: vi.fn(),
  teamFindUnique: vi.fn(),
  teamMemberFindFirst: vi.fn(),
  teamMemberFindMany: vi.fn(),
  teamMemberCount: vi.fn(),
  teamMemberCreate: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  getStoredLicense: vi.fn(),
  verifyStoredLicense: vi.fn(),
  LicenseClientError: class extends Error {
    code: string;
    status: number;

    constructor(code: string, status = 503) {
      super(code);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("../../lib/config.js", () => ({
  isLocalPostgres: () => mocks.localPostgres,
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    team: {
      findMany: mocks.teamFindMany,
      findUnique: mocks.teamFindUnique,
    },
    teamMember: {
      findFirst: mocks.teamMemberFindFirst,
      findMany: mocks.teamMemberFindMany,
      count: mocks.teamMemberCount,
    },
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../../lib/license-client.js", () => ({
  LicenseClientError: mocks.LicenseClientError,
  getStoredLicense: mocks.getStoredLicense,
  verifyStoredLicense: mocks.verifyStoredLicense,
}));

import { addMember, canUserLogin, getTeam, listTeams, TeamServiceError } from "./service.js";

const entitlement = {
  licenseId: "license-1",
  planCode: "team-10",
  expiresAt: 2_000_000_000,
  maxMembers: 10,
  bindingGeneration: 1,
};

beforeEach(() => {
  mocks.localPostgres = true;
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
  }
  mocks.getStoredLicense.mockReturnValue({
    licenseId: entitlement.licenseId,
    codeLastFour: "1234",
    bindingGeneration: entitlement.bindingGeneration,
    lastCheckedAt: "2026-09-05T00:00:00.000Z",
  });
  mocks.verifyStoredLicense.mockReturnValue({ entitlement });
});

describe("Team service", () => {
  it("returns a plain-language message while preserving the error code", () => {
    const error = new TeamServiceError("LICENSE_SERVICE_UNAVAILABLE", 503);

    expect(error).toMatchObject({
      code: "LICENSE_SERVICE_UNAVAILABLE",
      status: 503,
      message: "We couldn't reach the license service. Check your internet connection and try again.",
    });
  });

  it("returns team and license data needed by the Team UI", async () => {
    mocks.teamFindMany.mockResolvedValue([
      { id: "team-1", name: "Acme", _count: { members: 2 } },
    ]);

    const [team] = await listTeams("admin-1", true);

    expect(team).toMatchObject({
      id: "team-1",
      name: "Acme",
      memberCount: 2,
      canManage: true,
      license: {
        valid: true,
        status: "active",
        id: "license-1",
        codeLastFour: "1234",
        planCode: "team-10",
        maxMembers: 10,
      },
    });
  });

  it("does not expose a Team to a user without active membership", async () => {
    mocks.teamMemberFindFirst.mockResolvedValue(null);

    await expect(getTeam("team-1", "user-1", false)).resolves.toBeNull();
    expect(mocks.teamFindUnique).not.toHaveBeenCalled();
  });

  it("enforces the signed license seat limit before creating a member", async () => {
    mocks.teamFindUnique.mockResolvedValue({ id: "team-1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-2",
      email: "member@example.com",
      name: "Member",
      isSuperAdmin: false,
    });
    mocks.transaction.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) => callback({
      teamMember: {
        count: vi.fn().mockResolvedValue(10),
        create: mocks.teamMemberCreate,
      },
    }));

    await expect(addMember("team-1", "member@example.com", true))
      .rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED", status: 409 });
    expect(mocks.teamMemberCreate).not.toHaveBeenCalled();
  });

  it("rejects a member who already belongs to another active Team", async () => {
    mocks.teamFindUnique.mockResolvedValue({ id: "team-1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-2",
      email: "member@example.com",
      name: "Member",
      isSuperAdmin: false,
    });
    mocks.transaction.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) => callback({
      teamMember: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue({ teamId: "team-2" }),
        create: mocks.teamMemberCreate,
      },
    }));

    await expect(addMember("team-1", "member@example.com", true))
      .rejects.toMatchObject({ code: "MEMBER_ALREADY_ASSIGNED", status: 409 });
    expect(mocks.teamMemberCreate).not.toHaveBeenCalled();
  });

  it("allows users with no Team membership and denies users without a valid lease", async () => {
    mocks.teamMemberFindMany.mockResolvedValueOnce([]);
    await expect(canUserLogin("user-1")).resolves.toEqual({ allowed: true });

    mocks.teamMemberFindMany.mockResolvedValueOnce([{ teamId: "team-1" }]);
    mocks.verifyStoredLicense.mockImplementation(() => {
      throw new mocks.LicenseClientError("LICENSE_EXPIRED_OR_INVALID", 403);
    });

    await expect(canUserLogin("user-2")).resolves.toEqual({
      allowed: false,
      code: "LICENSE_EXPIRED_OR_INVALID",
    });
  });
});
