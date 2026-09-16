import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: vi.fn(() => true),
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  supabase: null,
  isDesktopMode: () => false,
  isLocalPostgres: () => true,
  useLocalAuth: () => true,
  getInstallMode: () => "web",
  getSsoConfig: () => ({ configured: true }),
  isSsoAuthMode: mocks.ssoMode,
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany, findFirst: mocks.userFindFirst },
  },
}));
vi.mock("../../lib/desktop-auth.js", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(() => false),
  createSession: vi.fn(),
  getSession: mocks.getSession,
  deleteSession: vi.fn(),
}));
vi.mock("../../lib/db-state.js", () => ({ isDbReady: () => true }));
vi.mock("../teams/service.js", () => ({ canUserLogin: vi.fn(async () => ({ allowed: true })) }));

const auth = await import("./service.js");

describe("SSO authentication capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ssoMode.mockReturnValue(true);
    mocks.userFindMany.mockResolvedValue([]);
  });

  it("does not advertise local password management", async () => {
    await expect(auth.getAuthConfig()).resolves.toMatchObject({
      authMode: "sso",
      supportsPasswordUpdate: false,
      needsSetup: false,
    });
  });

  it("does not trust a legacy local SuperAdmin flag", async () => {
    mocks.getSession.mockResolvedValue({ userId: "user-1" });
    mocks.userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      isSuperAdmin: true,
      mustChangePassword: false,
    });

    await expect(auth.getLocalSession("token")).resolves.toMatchObject({
      isSuperAdmin: false,
      isSso: true,
    });
  });
});
