import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/team-provisioning.js", () => ({
  membershipProvisioningSignature: () => "member-signature",
  teamProvisioningSignature: () => "team-signature",
}));

const { parseSsoWorkspaces, syncSsoWorkspaces } = await import("./sso-workspaces.js");

describe("Cloud SSO workspace grants", () => {
  it("rejects an incomplete control-plane response", () => {
    expect(() => parseSsoWorkspaces(undefined)).toThrow("workspace grant response is invalid");
    expect(() => parseSsoWorkspaces([{ id: "org-1", name: "Team" }])).toThrow("workspace grant is invalid");
    expect(() => parseSsoWorkspaces([
      { id: "org-1", name: "One", type: "team", role: "staff", status: "active" },
      { id: "org-1", name: "Two", type: "team", role: "staff", status: "active" },
    ])).toThrow("workspace grant is duplicated");
  });

  it("provisions authoritative Teams and deactivates stale memberships", async () => {
    const stale = {
      id: "member-old",
      teamId: "team-old",
      userId: "user-1",
      role: "staff",
      status: "active",
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const tx = {
      team: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(({ data }) => Promise.resolve(data)),
        update: vi.fn(),
      },
      teamMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        findMany: vi.fn().mockResolvedValue([stale]),
        update: vi.fn(),
      },
    };
    const db = { $transaction: (callback: (value: typeof tx) => Promise<void>) => callback(tx) };

    await syncSsoWorkspaces(db, "user-1", parseSsoWorkspaces([
      { id: "org-1", name: " Cloud Team ", type: "team", role: "owner", status: "active" },
      { id: "personal-1", name: "Personal", type: "personal", role: "owner", status: "active" },
    ]));

    expect(tx.team.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      name: "Cloud Team",
      ssoOrganizationId: "org-1",
      status: "active",
    }) });
    expect(tx.teamMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: "user-1", role: "manager", status: "active" }),
    }));
    expect(tx.teamMember.update).toHaveBeenCalledWith({
      where: { id: "member-old" },
      data: { status: "inactive", provisioningSignature: "member-signature" },
    });
  });
});
