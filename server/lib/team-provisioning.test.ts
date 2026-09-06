import { describe, expect, it } from "vitest";

import { isProvisionedMembership, membershipProvisioningSignature } from "./team-provisioning.js";

describe("Team membership provisioning", () => {
  it("rejects a role changed outside the managed Team flow", () => {
    const member = { id: "member-1", teamId: "team-1", userId: "user-1", role: "staff", status: "active", joinedAt: new Date("2026-01-01T00:00:00.000Z") };
    const provisioningSignature = membershipProvisioningSignature(member);

    expect(isProvisionedMembership({ ...member, provisioningSignature })).toBe(true);
    expect(isProvisionedMembership({ ...member, role: "manager", provisioningSignature })).toBe(false);
  });
});
