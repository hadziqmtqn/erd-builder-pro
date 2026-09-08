import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  canUserLogin: vi.fn(),
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
  canAccessTeam: vi.fn(async () => true),
  canUserLogin: mocks.canUserLogin,
}));
vi.mock("./team-scope.js", () => ({ runWithTeamScope: (_scope: unknown, next: () => void) => next() }));

const { authenticate } = await import("./middleware.js");

describe("SSO authorization", () => {
  it("ignores legacy local administrator and temporary-password flags", async () => {
    mocks.getSession.mockResolvedValue({ userId: "user-1", email: "user@example.com" });
    mocks.findUser.mockResolvedValue({ isSuperAdmin: true, mustChangePassword: true });
    mocks.canUserLogin.mockResolvedValue({ allowed: true });
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
});
