import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidCloudOrganization, isValidCloudWebhook } from "./control-plane.js";

describe("Cloud control-plane webhook", () => {
  it("accepts only a current matching HMAC signature", () => {
    const secret = "a".repeat(64);
    const eventId = "01a08006-50f4-730e-86bc-6c7213246329";
    const timestamp = "1800000000";
    const body = JSON.stringify({ id: eventId, type: "cloud.workspace.sync" });
    const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    const input = { secret, eventId, timestamp, signature, body, now: 1_800_000_000_000 };

    expect(isValidCloudWebhook(input)).toBe(true);
    expect(isValidCloudWebhook({ ...input, body: `${body} ` })).toBe(false);
    expect(isValidCloudWebhook({ ...input, now: input.now + 301_000 })).toBe(false);
    expect(isValidCloudWebhook({ ...input, eventId: "------------------------------------" })).toBe(false);
  });

  it("rejects malformed or duplicate organization members", () => {
    const organization = {
      id: "01a08006-50f4-730e-86bc-6c7213246329",
      name: "Test Team",
      status: "active",
      members: [{ user_id: "01a076cd-f765-710e-a1e1-fd1b1dee9a20", role: "manager", status: "active" }],
    };

    expect(isValidCloudOrganization(organization)).toBe(true);
    expect(isValidCloudOrganization({ ...organization, members: [...organization.members, ...organization.members] })).toBe(false);
    expect(isValidCloudOrganization({ ...organization, members: [{ ...organization.members[0], role: "owner" }] })).toBe(false);
  });
});
