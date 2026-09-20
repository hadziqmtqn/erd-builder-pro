import { describe, expect, it } from "vitest";

import { addTeamMemberSchema, aiProxySchema } from "./validation.js";

describe("add team member validation", () => {
  it("requires a matching confirmation when a new account password is provided", () => {
    const member = { email: "member@example.com", name: "Member", password: "temporary-password" };

    expect(addTeamMemberSchema.safeParse(member).success).toBe(false);
    expect(addTeamMemberSchema.safeParse({ ...member, confirmPassword: member.password }).success).toBe(true);
  });
});

describe("AI proxy chat persistence validation", () => {
  it("accepts persistence identifiers only as a pair", () => {
    const request = { messages: [{ role: "user", content: "Hello" }] };

    expect(aiProxySchema.safeParse(request).success).toBe(true);
    expect(aiProxySchema.safeParse({ ...request, chat_session_id: "session-1" }).success).toBe(false);
    expect(aiProxySchema.safeParse({
      ...request,
      chat_session_id: "session-1",
      assistant_client_message_id: "assistant-1",
    }).success).toBe(true);
  });
});
