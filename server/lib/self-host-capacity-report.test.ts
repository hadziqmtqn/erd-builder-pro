import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isLocalPostgres: vi.fn(() => true),
  getStoredInstanceLicense: vi.fn(() => ({ installationId: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa" })),
  checkSelfHostInstanceLicense: vi.fn(),
  instanceLicenseUsage: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock("./config.js", () => ({ isLocalPostgres: mocks.isLocalPostgres }));
vi.mock("./license-client.js", () => ({
  getStoredInstanceLicense: mocks.getStoredInstanceLicense,
  checkSelfHostInstanceLicense: mocks.checkSelfHostInstanceLicense,
  LicenseClientError: class LicenseClientError extends Error {},
}));
vi.mock("./instance-license-usage.js", () => ({ instanceLicenseUsage: mocks.instanceLicenseUsage }));
vi.mock("./logger.js", () => ({ logger: mocks.logger }));

import { startSelfHostCapacityReportScheduler } from "./self-host-capacity-report.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Self-host capacity report scheduler", () => {
  it("sends a daily aggregate report in the 01:00 jitter window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T00:00:00.000Z"));
    const usage = { teamCount: 2, memberCount: 8 };
    mocks.instanceLicenseUsage.mockResolvedValue(usage);
    mocks.checkSelfHostInstanceLicense.mockResolvedValue({
      capacityReport: { accepted: true, exceeded: false },
    });

    startSelfHostCapacityReportScheduler();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    expect(mocks.instanceLicenseUsage).toHaveBeenCalledTimes(1);
    expect(mocks.checkSelfHostInstanceLicense).toHaveBeenCalledWith(usage, { kind: "daily" });
    expect(mocks.logger.info).toHaveBeenCalledWith("Self-host daily capacity report accepted");
  });
});
