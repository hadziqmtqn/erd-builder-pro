import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: vi.fn(() => false),
  provisionedTeam: false,
  database: {
    team: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    teamMember: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
  license: {
    getStored: vi.fn(() => ({ lastCheckedAt: new Date().toISOString() })),
    verifyStored: vi.fn(() => ({ entitlement: { maxTeams: 10, maxMembers: 10 } })),
    check: vi.fn(async () => ({ entitlement: { maxTeams: 10, maxMembers: 10 } })),
    LicenseClientError: class MockLicenseClientError extends Error {
      constructor(public readonly code: string, public readonly status = 503) { super(code); }
    },
  },
}));

vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isSsoAuthMode: mocks.ssoMode }));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.database }));
vi.mock("../../lib/team-provisioning.js", () => ({
  isProvisionedTeam: () => mocks.provisionedTeam,
  isProvisionedMembership: () => false,
  membershipProvisioningSignature: () => "signature",
  teamProvisioningSignature: () => "signature",
}));
vi.mock("../../lib/license-client.js", () => ({
  checkSelfHostInstanceLicense: mocks.license.check,
  getStoredInstanceLicense: mocks.license.getStored,
  verifyStoredInstanceLicense: mocks.license.verifyStored,
  LicenseClientError: mocks.license.LicenseClientError,
}));

const teams = await import("./service.js");

describe("Team integrity", () => {
  it("lists locally provisioned Teams in Cloud SSO mode without a self-host instance license", async () => {
    mocks.ssoMode.mockReturnValue(true);
    mocks.database.team.findMany.mockResolvedValue([]);

    await expect(teams.listTeams("cloud-admin", true)).resolves.toEqual([]);
    expect(mocks.database.team.findMany).toHaveBeenCalledOnce();

    mocks.ssoMode.mockReturnValue(false);
  });

  it("does not let a Manager deactivate their own Team membership", async () => {
    await expect(teams.removeMember("team-1", "manager-1", "manager-1", false)).rejects.toMatchObject({ code: "CANNOT_REMOVE_SELF" });
    expect(mocks.database.teamMember.findFirst).not.toHaveBeenCalled();
  });

  it("does not expose a locked SSO Team as the active workspace", async () => {
    mocks.ssoMode.mockReturnValue(true);
    mocks.database.teamMember.findMany.mockResolvedValue([{ teamId: "locked-team", userId: "user-1", status: "active" }]);
    mocks.database.teamMember.findFirst.mockResolvedValue({ teamId: "locked-team", userId: "user-1", status: "active" });
    mocks.database.team.findUnique.mockResolvedValue({ id: "locked-team", type: "team", status: "locked", members: [] });

    await expect(teams.canUserLogin("user-1")).resolves.toEqual({ allowed: true });
    mocks.ssoMode.mockReturnValue(false);
  });

  it("revokes a removed member's access to their Team without affecting Personal access", async () => {
    mocks.ssoMode.mockReturnValue(true);
    mocks.database.teamMember.findFirst.mockResolvedValue(null);

    await expect(teams.canAccessTeam("team-1", "removed-user", false)).resolves.toBe(false);

    mocks.ssoMode.mockReturnValue(false);
  });

  it("revokes access immediately when a Cloud Team is locked", async () => {
    mocks.ssoMode.mockReturnValue(true);
    mocks.database.teamMember.findFirst.mockResolvedValue({ teamId: "locked-team", userId: "user-1", status: "active" });
    mocks.database.team.findUnique.mockResolvedValue({ id: "locked-team", type: "team", status: "locked", members: [] });

    await expect(teams.canAccessTeam("locked-team", "user-1", false)).resolves.toBe(false);

    mocks.ssoMode.mockReturnValue(false);
  });

  it("rejects local Team mutations in Cloud SSO mode", async () => {
    mocks.ssoMode.mockReturnValue(true);

    await expect(teams.createTeam({ name: "Shadow Team", userId: "user-1", isSuperAdmin: true }))
      .rejects.toMatchObject({ code: "CLOUD_TEAM_MANAGED_EXTERNALLY" });

    mocks.ssoMode.mockReturnValue(false);
  });

  it("refreshes the entitlement before creating a Team", async () => {
    mocks.database.team.findFirst.mockResolvedValue(null);
    mocks.database.team.count.mockResolvedValue(1);
    mocks.database.teamMember.count.mockResolvedValue(1);
    mocks.license.check.mockResolvedValue({ entitlement: { maxTeams: 1, maxMembers: 10 } });

    await expect(teams.createTeam({ name: "Downgraded Team", userId: "admin", isSuperAdmin: true }))
      .rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
    expect(mocks.license.check).toHaveBeenCalledWith({ teamCount: 1, memberCount: 1 });
    expect(mocks.database.team.create).not.toHaveBeenCalled();
  });

  it("blocks adding a member when the freshly checked limit is reached", async () => {
    mocks.provisionedTeam = true;
    mocks.database.team.findUnique.mockResolvedValue({ id: "team-1", type: "team", status: "active", members: [] });
    mocks.database.team.count.mockResolvedValue(1);
    mocks.database.teamMember.count.mockResolvedValue(1);
    mocks.database.user.findUnique.mockResolvedValue({ id: "user-2", email: "user-2@example.com", isSuperAdmin: false });
    mocks.license.check.mockResolvedValue({ entitlement: { maxTeams: 10, maxMembers: 1 } });

    await expect(teams.addMember("team-1", "user-2@example.com", "admin", true))
      .rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED" });
    expect(mocks.license.check).toHaveBeenCalledWith({ teamCount: 1, memberCount: 1 });
    expect(mocks.database.teamMember.upsert).not.toHaveBeenCalled();
    mocks.provisionedTeam = false;
  });

  it("blocks every Team management operation for a manually inserted Team", async () => {
    mocks.database.team.findUnique.mockResolvedValue({ id: "manual-team", type: "team", status: "active", members: [] });

    await expect(teams.getTeam("manual-team", "admin", true)).rejects.toMatchObject({ code: "TEAM_INTEGRITY_UNAVAILABLE" });
    await expect(teams.updateTeam("manual-team", "Renamed", "admin", true)).rejects.toMatchObject({ code: "TEAM_INTEGRITY_UNAVAILABLE" });
    await expect(teams.updateMemberRole("manual-team", "member", "manager", "admin", true)).rejects.toMatchObject({ code: "TEAM_INTEGRITY_UNAVAILABLE" });
    await expect(teams.removeMember("manual-team", "member", "admin", true)).rejects.toMatchObject({ code: "TEAM_INTEGRITY_UNAVAILABLE" });

    expect(mocks.database.team.update).not.toHaveBeenCalled();
    expect(mocks.database.teamMember.update).not.toHaveBeenCalled();
  });
});
