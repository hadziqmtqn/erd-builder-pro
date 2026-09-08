import { describe, expect, it } from "vitest";

import { isProvisionedMembership, isProvisionedTeam, membershipProvisioningSignature, teamProvisioningSignature } from "./team-provisioning.js";

describe("Team membership provisioning", () => {
  it("rejects a role changed outside the managed Team flow", () => {
    const member = { id: "member-1", teamId: "team-1", userId: "user-1", role: "staff", status: "active", joinedAt: new Date("2026-01-01T00:00:00.000Z") };
    const provisioningSignature = membershipProvisioningSignature(member);

    expect(isProvisionedMembership({ ...member, provisioningSignature })).toBe(true);
    expect(isProvisionedMembership({ ...member, role: "manager", provisioningSignature })).toBe(false);
  });

  it("rejects a Cloud entitlement changed outside the control plane", () => {
    const team = { id: "team-1", status: "active", createdAt: new Date("2026-01-01T00:00:00.000Z"), cloudEntitlement: '{"revision":"a"}' };
    const provisioningSignature = teamProvisioningSignature(team);

    expect(isProvisionedTeam({ ...team, provisioningSignature })).toBe(true);
    expect(isProvisionedTeam({ ...team, cloudEntitlement: '{"revision":"b"}', provisioningSignature })).toBe(false);
  });
});
