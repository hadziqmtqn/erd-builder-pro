import { describe, expect, it } from "vitest";

import { parseCloudEntitlement } from "./cloud-entitlement.js";

const grant = (trial: unknown) => ({
  status: "active",
  revision: "a".repeat(64),
  capabilities: {},
  limits: { max_members: 5 },
  trial,
});

describe("Cloud entitlement Trial (CLD-013.3)", () => {
  it("keeps the Trial survey key and dates", () => {
    expect(parseCloudEntitlement(grant({ survey_key: "beta_trial", starts_at: "2026-11-06T05:24:55Z", ends_at: null }), "active")?.trial)
      .toEqual({ survey_key: "beta_trial", starts_at: "2026-11-06T05:24:55Z", ends_at: null });
    expect(parseCloudEntitlement(grant({ survey_key: "cloud_trial", starts_at: "2026-11-06T05:24:55Z", ends_at: "2026-11-20T05:24:55Z" }), "active")?.trial?.ends_at)
      .toBe("2026-11-20T05:24:55Z");
  });

  it.each([
    undefined,
    null,
    { survey_key: "other_trial", starts_at: "2026-11-06T05:24:55Z", ends_at: null },
    { survey_key: "beta_trial", starts_at: "not a date", ends_at: null },
    { survey_key: "beta_trial", starts_at: "2026-11-06T05:24:55Z", ends_at: 42 },
  ])("drops a missing or malformed Trial %j without invalidating the grant", (trial) => {
    const entitlement = parseCloudEntitlement(grant(trial), "active");
    expect(entitlement).not.toBeNull();
    expect(entitlement?.trial).toBeNull();
  });
});
