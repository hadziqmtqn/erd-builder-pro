import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktopMode: vi.fn(() => true),
  isLocalPostgres: vi.fn(() => false),
  isSsoAuthMode: vi.fn(() => false),
}));

vi.mock("./config.js", () => ({
  isDesktopMode: mocks.isDesktopMode,
  isLocalPostgres: mocks.isLocalPostgres,
  isSsoAuthMode: mocks.isSsoAuthMode,
}));
vi.mock("./team-scope.js", () => ({
  currentTeamScope: vi.fn(),
  projectScopeWhere: vi.fn(),
}));

import { requireAdmin } from "./security.js";

describe("requireAdmin Express middleware", () => {
  beforeEach(() => mocks.isSsoAuthMode.mockReturnValue(false));

  it("continues to the handler for an admin", () => {
    const next = vi.fn();

    expect(requireAdmin({} as any, {} as any, next)).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it("stops after sending the rejection", () => {
    mocks.isSsoAuthMode.mockReturnValue(true);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    expect(requireAdmin({} as any, res, next)).toBe(false);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
