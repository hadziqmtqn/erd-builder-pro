import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ssoMode: vi.fn(() => true),
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdate: vi.fn(),
  getSession: vi.fn(),
  verifyPassword: vi.fn(() => false),
  createSession: vi.fn(),
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
    user: { findMany: mocks.userFindMany, findFirst: mocks.userFindFirst, update: mocks.userUpdate },
  },
}));
vi.mock("../../lib/desktop-auth.js", () => ({
  hashPassword: vi.fn(),
  verifyPassword: mocks.verifyPassword,
  createSession: mocks.createSession,
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
    mocks.userUpdate.mockResolvedValue({});
    mocks.createSession.mockResolvedValue("session-token");
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

describe("local password lockout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.ssoMode.mockReturnValue(false);
    mocks.userUpdate.mockResolvedValue({});
    mocks.userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
      password: "stored-hash",
      isSuperAdmin: true,
      loginFailedAttempts: 4,
      loginLockedUntil: null,
    });
    mocks.verifyPassword.mockReturnValue(false);
  });

  it("persists the first temporary lockout without changing the public failure response", async () => {
    await expect(auth.localLogin("user@example.com", "wrong")).resolves.toBeNull();

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        loginFailedAttempts: 5,
        loginLockedUntil: expect.any(Date),
      },
    });
  });

  it("blocks a locked account and resets state after a successful recovery", async () => {
    const now = new Date("2026-09-25T10:00:00.000Z");
    vi.setSystemTime(now);
    const user = {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      password: "stored-hash",
      isSuperAdmin: true,
      loginFailedAttempts: 5,
      loginLockedUntil: new Date(now.getTime() + 60_000),
    };
    mocks.userFindFirst.mockResolvedValue(user);
    mocks.verifyPassword.mockReturnValue(true);

    await expect(auth.localLogin("user@example.com", "correct")).resolves.toBeNull();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(now.getTime() + 60_001));
    await expect(auth.localLogin("user@example.com", "correct")).resolves.toMatchObject({
      token: "session-token",
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { loginFailedAttempts: 0, loginLockedUntil: null },
    });
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
