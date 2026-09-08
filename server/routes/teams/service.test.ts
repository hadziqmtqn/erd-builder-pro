import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: vi.fn(() => false),
  database: {
    team: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    teamMember: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isSsoAuthMode: mocks.ssoMode }));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.database }));
vi.mock("../../lib/team-provisioning.js", () => ({
  isProvisionedTeam: () => false,
  isProvisionedMembership: () => false,
  membershipProvisioningSignature: () => "signature",
  teamProvisioningSignature: () => "signature",
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

  it("rejects local Team mutations in Cloud SSO mode", async () => {
    mocks.ssoMode.mockReturnValue(true);

    await expect(teams.createTeam({ name: "Shadow Team", userId: "user-1", isSuperAdmin: true }))
      .rejects.toMatchObject({ code: "CLOUD_TEAM_MANAGED_EXTERNALLY" });

    mocks.ssoMode.mockReturnValue(false);
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
