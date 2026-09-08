import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  canUserLogin: vi.fn(),
  canAccessTeam: vi.fn(),
}));

vi.mock("./config.js", () => ({
  supabase: null,
  isDesktopMode: () => false,
  isLocalPostgres: () => true,
  useLocalAuth: () => true,
  isSsoAuthMode: () => true,
}));
vi.mock("./desktop-auth.js", () => ({ getSession: mocks.getSession }));
vi.mock("./prisma.js", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));
vi.mock("../routes/teams/service.js", () => ({
  canAccessTeam: mocks.canAccessTeam,
  canUserLogin: mocks.canUserLogin,
}));
vi.mock("./team-scope.js", () => ({ runWithTeamScope: (_scope: unknown, next: () => void) => next() }));

const { authenticate } = await import("./middleware.js");
const { requireAdmin } = await import("./security.js");

describe("SSO authorization", () => {
  it("rejects local administration even when a legacy record was an administrator", () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    expect(requireAdmin({ user: { isSuperAdmin: true } } as any, res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("ignores legacy local administrator and temporary-password flags", async () => {
    mocks.getSession.mockResolvedValue({ userId: "user-1", email: "user@example.com" });
    mocks.findUser.mockResolvedValue({ isSuperAdmin: true, mustChangePassword: true });
    mocks.canUserLogin.mockResolvedValue({ allowed: true });
    mocks.canAccessTeam.mockResolvedValue(true);
    const req = {
      headers: { authorization: "Bearer token" },
      cookies: {},
      query: {},
      method: "GET",
      originalUrl: "/api/notes",
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(req.user).toMatchObject({ isSuperAdmin: false, mustChangePassword: false });
    expect(mocks.canUserLogin).toHaveBeenCalledWith("user-1");
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a stale Team scope after membership or subscription revocation", async () => {
    mocks.getSession.mockResolvedValue({ userId: "user-1", email: "user@example.com" });
    mocks.findUser.mockResolvedValue({ isSuperAdmin: false, mustChangePassword: false });
    mocks.canUserLogin.mockResolvedValue({ allowed: true });
    mocks.canAccessTeam.mockResolvedValue(false);
    const req = {
      headers: { authorization: "Bearer token", "x-team-id": "revoked-team" },
      cookies: {},
      query: {},
      method: "GET",
      originalUrl: "/api/notes",
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Resource not found" });
    expect(next).not.toHaveBeenCalled();
  });
});
