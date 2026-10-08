import type { NextFunction, Response } from "express";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstallMode: vi.fn(() => "desktop"),
}));

vi.mock("../../lib/config.js", () => ({ getInstallMode: mocks.getInstallMode }));
vi.mock("../../lib/middleware.js", () => ({ authenticate: vi.fn(), rejectInSsoMode: vi.fn() }));
vi.mock("../../lib/security.js", () => ({ requireAdmin: vi.fn() }));
vi.mock("../../lib/license-client.js", () => ({
  activateSelfHostInstanceLicense: vi.fn(),
  checkSelfHostInstanceLicense: vi.fn(),
  LicenseClientError: class extends Error {},
  verifyStoredInstanceLicense: vi.fn(),
}));
vi.mock("../../lib/instance-license-usage.js", () => ({ instanceLicenseUsage: vi.fn() }));
vi.mock("../../lib/self-host-capacity-report.js", () => ({
  reportSelfHostCapacityChange: vi.fn(),
  startSelfHostCapacityReportScheduler: vi.fn(),
}));

import { blockDesktopCliLicenseManagement } from "./index.js";

it("blocks direct license-management access in Desktop and CLI only", () => {
  for (const installMode of ["desktop", "cli"]) {
    mocks.getInstallMode.mockReturnValue(installMode);
    const status = vi.fn();
    const json = vi.fn();
    const response = { status, json } as unknown as Response;
    status.mockReturnValue(response);
    const next = vi.fn() as unknown as NextFunction;

    blockDesktopCliLicenseManagement({} as never, response, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: "Not found" });
    expect(next).not.toHaveBeenCalled();
  }

  mocks.getInstallMode.mockReturnValue("web");
  const response = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  blockDesktopCliLicenseManagement({} as never, response, next);

  expect(response.status).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledOnce();
});
