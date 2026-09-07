import { describe, expect, it } from "vitest";

import { addTeamMemberSchema } from "./validation.js";

describe("add team member validation", () => {
  it("requires a matching confirmation when a new account password is provided", () => {
    const member = { email: "member@example.com", name: "Member", password: "temporary-password" };

    expect(addTeamMemberSchema.safeParse(member).success).toBe(false);
    expect(addTeamMemberSchema.safeParse({ ...member, confirmPassword: member.password }).success).toBe(true);
  });
});
