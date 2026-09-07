import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: {
    team: { findUnique: vi.fn(), update: vi.fn() },
    teamMember: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true }));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.database }));
vi.mock("../../lib/team-provisioning.js", () => ({
  isProvisionedTeam: () => false,
  isProvisionedMembership: () => false,
  membershipProvisioningSignature: () => "signature",
  teamProvisioningSignature: () => "signature",
}));

const teams = await import("./service.js");

describe("Team integrity", () => {
  it("does not let a Manager deactivate their own Team membership", async () => {
    await expect(teams.removeMember("team-1", "manager-1", "manager-1", false)).rejects.toMatchObject({ code: "CANNOT_REMOVE_SELF" });
    expect(mocks.database.teamMember.findFirst).not.toHaveBeenCalled();
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
