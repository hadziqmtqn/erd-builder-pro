import cookieParser from "cookie-parser";
import express from "express";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// BUG-104: only the Desktop and CLI apps sign in automatically and make every user admin. The Docker image declares
// ERD_INSTALL_MODE=docker and, on SQLite, behaves like local PostgreSQL: first-run administrator setup, password
// login and a SuperAdmin flag per user. The real auth router, authenticate, requireAdmin, safeAiBaseUrl and
// install-mode detection run here; the database is an in-memory user and session store.

const db = vi.hoisted(() => {
  // config.ts reads SUPABASE_URL once on import; keep it empty so DATABASE_URL decides the mode.
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");

  type Row = Record<string, any>;
  const users: Row[] = [];
  const sessions: Row[] = [];
  let nextId = 1;
  const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "NOT") return !matches(row, value);
    if (value && typeof value === "object" && "lt" in value) return row[key] < value.lt;
    return row[key] === value;
  });
  const copy = (row: Row | undefined) => (row ? { ...row } : null);
  const prisma = {
    user: {
      findMany: async ({ take }: Row = {}) => users.slice(0, take ?? users.length).map(row => ({ ...row })),
      findFirst: async ({ where }: Row = {}) => copy(users.find(row => matches(row, where))),
      findUnique: async ({ where }: Row) => copy(users.find(row => matches(row, where))),
      count: async () => users.length,
      create: async ({ data }: Row) => {
        const row = {
          id: `user-${nextId++}`,
          name: null,
          isSuperAdmin: false,
          mustChangePassword: false,
          loginFailedAttempts: 0,
          loginLockedUntil: null,
          createdAt: new Date(),
          ...data,
        };
        users.push(row);
        return { ...row };
      },
      update: async ({ where, data }: Row) => {
        const row = users.find(candidate => matches(candidate, where));
        if (!row) throw new Error("Record to update not found");
        return { ...Object.assign(row, data) };
      },
    },
    session: {
      create: async ({ data }: Row) => {
        sessions.push({ ...data, createdAt: new Date() });
        return data;
      },
      findFirst: async ({ where }: Row) => copy(sessions.find(row => matches(row, where))),
      deleteMany: async ({ where }: Row) => {
        const kept = sessions.filter(row => !matches(row, where));
        const count = sessions.length - kept.length;
        sessions.splice(0, sessions.length, ...kept);
        return { count };
      },
    },
  };
  return {
    users,
    sessions,
    prisma,
    reset: () => {
      users.length = 0;
      sessions.length = 0;
    },
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: db.prisma }));
// Teams exist only on local PostgreSQL and have their own tests; every account here may sign in.
vi.mock("../teams/service.js", () => ({
  canUserLogin: vi.fn(async () => ({ allowed: true })),
  canAccessTeam: vi.fn(async () => false),
}));

const { default: authRouter } = await import("./index.js");
const { authenticate } = await import("../../lib/middleware.js");
const { requireAdmin } = await import("../../lib/security.js");
const { safeAiBaseUrl } = await import("../../lib/ai-security.js");
const { getInstallMode, isDesktopInstall } = await import("../../lib/config.js");
const { hashPassword } = await import("../../lib/desktop-auth.js");
const { setDbReady } = await import("../../lib/db-state.js");

const SQLITE_URL = "file:/app/data/erd-builder.db";
const POSTGRES_URL = "postgresql://user:pass@db:5432/erdbpro";
const DESKTOP_EMAIL = "admin@local.dev";
const DESKTOP_PASSWORD = "admin123";
const OWNER = { name: "Owner", email: "owner@example.com", password: "owner-password", confirmPassword: "owner-password" };

const MODES = {
  // The image sets this (Dockerfile); Kiri, Podman and Kubernetes have no /.dockerenv to detect.
  docker: { DATABASE_URL: SQLITE_URL, ERD_INSTALL_MODE: "docker" },
  // Desktop and CLI launchers set ERD_INSTALL_MODE themselves (src-tauri/src/lib.rs, cli/src/cli.mjs).
  desktop: { DATABASE_URL: "file:/Users/me/Library/Application Support/com.erdbuilderpro.app/data.db", ERD_INSTALL_MODE: "desktop" },
  cli: { DATABASE_URL: "file:/Users/me/.erdbpro/data.db", ERD_INSTALL_MODE: "cli" },
  web: { DATABASE_URL: POSTGRES_URL },
};

let server: Server;
let baseUrl: string;
let dockerenvSpy: { mockRestore: () => void } | undefined;
const realExistsSync = fs.existsSync;

beforeAll(async () => {
  // SQLite installs answer /api/me with 503 until startup has checked the database.
  setDbReady();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Mounted at /api in server/index.ts.
  app.use("/api", authRouter);
  // Stands in for SuperAdmin routes such as /api/ai/settings/providers.
  app.get("/api/admin-only", authenticate, requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  db.reset();
  // The test host may itself run in a container; only the declared mode and DATABASE_URL decide here.
  dockerenvSpy = vi.spyOn(fs, "existsSync").mockImplementation(path => path !== "/.dockerenv" && realExistsSync(path));
});

afterEach(() => {
  dockerenvSpy?.mockRestore();
  vi.unstubAllEnvs();
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
});

function useMode(env: Record<string, string>) {
  // Clear what a developer shell or .env could set, so only this case decides the install mode.
  for (const key of ["ERD_INSTALL_MODE", "VERCEL", "DOCKER", "AUTH_MODE", "AI_ALLOW_PRIVATE_BASE_URL"]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

async function call(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Cookie: `token=${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: response.status, body: await response.json(), setCookie: response.headers.get("set-cookie") };
}

function login(email: string, password: string) {
  return call("/api/login", { method: "POST", body: { email, password } });
}

function addUser(row: { id: string; email: string; password: string; isSuperAdmin: boolean }) {
  db.users.push({
    ...row,
    name: row.email.split("@")[0],
    password: hashPassword(row.password),
    mustChangePassword: false,
    loginFailedAttempts: 0,
    loginLockedUntil: null,
    createdAt: new Date(),
  });
}

describe.each([
  { name: "Docker on SQLite", env: MODES.docker, installMode: "docker" },
  { name: "local PostgreSQL", env: MODES.web, installMode: "web" },
])("BUG-104 $name", ({ env, installMode }) => {
  beforeEach(() => useMode(env));

  it("does not sign in a visitor without a session", async () => {
    expect(getInstallMode()).toBe(installMode);
    expect(isDesktopInstall()).toBe(false);

    const me = await call("/api/me");
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ authenticated: false });
    expect(me.setCookie).toBeNull();
    expect(db.users).toHaveLength(0);
    expect(db.sessions).toHaveLength(0);
    expect((await call("/api/admin-only")).status).toBe(401);
  });

  it("asks for the first administrator and does not send the Desktop credentials", async () => {
    const config = await call("/api/auth-config");
    expect(config.body).toMatchObject({
      authMode: "password",
      installMode,
      isDesktop: false,
      needsSetup: true,
      supportsPasswordUpdate: true,
    });
    expect(config.body).not.toHaveProperty("desktopDefaultEmail");
    expect(config.body).not.toHaveProperty("desktopDefaultPassword");
  });

  it("creates no account from the login form", async () => {
    expect((await login("visitor@example.com", "visitor-password")).status).toBe(401);
    expect(db.users).toHaveLength(0);
  });

  it("creates the administrator once, then checks the password and each user's SuperAdmin flag", async () => {
    const setup = await call("/api/setup", { method: "POST", body: OWNER });
    expect(setup.status).toBe(200);
    expect(setup.body.user).toMatchObject({ email: OWNER.email, isSuperAdmin: true });
    expect((await call("/api/auth-config")).body.needsSetup).toBe(false);
    const takeover = { ...OWNER, email: "late@example.com" };
    expect((await call("/api/setup", { method: "POST", body: takeover })).status).toBe(404);

    expect((await login(OWNER.email, "wrong-password")).status).toBe(401);
    const owner = await login(OWNER.email, OWNER.password);
    expect(owner.status).toBe(200);
    expect(owner.setCookie).toMatch(/HttpOnly/i);
    expect((await call("/api/me", { token: owner.body.token })).body).toMatchObject({
      authenticated: true,
      user: { email: OWNER.email, isSuperAdmin: true },
    });
    expect((await call("/api/admin-only", { token: owner.body.token })).status).toBe(200);

    addUser({ id: "member", email: "member@example.com", password: "member-password", isSuperAdmin: false });
    const member = await login("member@example.com", "member-password");
    expect(member.status).toBe(200);
    expect(member.body.user.isSuperAdmin).toBe(false);
    expect((await call("/api/me", { token: member.body.token })).body.user.isSuperAdmin).toBe(false);
    expect((await call("/api/admin-only", { token: member.body.token })).status).toBe(403);
  });

  it("lets the administrator change the password with the current one", async () => {
    const { body } = await call("/api/setup", { method: "POST", body: OWNER });
    const account = (input: Record<string, string>) => call("/api/account", { method: "PUT", token: body.token, body: input });

    expect((await account({ newPassword: "next-password" })).status).toBe(400);
    expect((await account({ currentPassword: "wrong-password", newPassword: "next-password" })).status).toBe(400);
    expect((await account({ currentPassword: OWNER.password, newPassword: "next-password" })).status).toBe(200);
    expect((await login(OWNER.email, OWNER.password)).status).toBe(401);
    expect((await login(OWNER.email, "next-password")).status).toBe(200);
  });

  it("keeps an install whose only account is the Desktop admin open through setup, with its data", async () => {
    // Older Docker SQLite images seeded this account and signed every visitor in as it.
    addUser({ id: "legacy-admin", email: DESKTOP_EMAIL, password: DESKTOP_PASSWORD, isSuperAdmin: true });

    expect((await login(DESKTOP_EMAIL, DESKTOP_PASSWORD)).status).toBe(401);
    expect((await call("/api/me")).body).toEqual({ authenticated: false });
    expect((await call("/api/auth-config")).body.needsSetup).toBe(true);

    const setup = await call("/api/setup", { method: "POST", body: OWNER });
    expect(setup.status).toBe(200);
    // The same user row keeps the documents it owns; only its sign-in details change.
    expect(setup.body.user.id).toBe("legacy-admin");
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ id: "legacy-admin", email: OWNER.email, isSuperAdmin: true });
    expect((await login(OWNER.email, OWNER.password)).status).toBe(200);
  });

  it("keeps private AI provider addresses closed without AI_ALLOW_PRIVATE_BASE_URL", async () => {
    await expect(safeAiBaseUrl("http://127.0.0.1:11434/v1", "")).rejects.toThrow("Private AI provider URLs are disabled");
  });
});

describe.each([
  { name: "Desktop app", env: MODES.desktop, installMode: "desktop", sendsDesktopCredentials: true },
  { name: "CLI", env: MODES.cli, installMode: "cli", sendsDesktopCredentials: false },
])("BUG-104 $name", ({ env, installMode, sendsDesktopCredentials }) => {
  beforeEach(() => useMode(env));

  it("still signs in automatically as the local admin", async () => {
    expect(getInstallMode()).toBe(installMode);
    expect(isDesktopInstall()).toBe(true);

    const me = await call("/api/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ authenticated: true, user: { email: DESKTOP_EMAIL, isSuperAdmin: true } });
    expect(me.setCookie).toMatch(/^token=/);
    expect((await call("/api/admin-only", { token: me.body.token })).status).toBe(200);
    expect((await call("/api/me", { token: me.body.token })).body).toMatchObject({
      authenticated: true,
      user: { email: DESKTOP_EMAIL, isSuperAdmin: true },
    });
  });

  it("needs no administrator setup and sends the Desktop credentials only to the Desktop app", async () => {
    const config = await call("/api/auth-config");
    expect(config.body).toMatchObject({ installMode, isDesktop: true, needsSetup: false, supportsPasswordUpdate: false });
    if (sendsDesktopCredentials) {
      expect(config.body).toMatchObject({ desktopDefaultEmail: DESKTOP_EMAIL, desktopDefaultPassword: DESKTOP_PASSWORD });
    } else {
      expect(config.body).not.toHaveProperty("desktopDefaultEmail");
      expect(config.body).not.toHaveProperty("desktopDefaultPassword");
    }
    expect((await call("/api/setup", { method: "POST", body: OWNER })).status).not.toBe(200);
    expect(db.users).toHaveLength(0);
  });

  it("still lets a local model on the user's machine be the AI provider", async () => {
    await expect(safeAiBaseUrl("http://127.0.0.1:11434/v1", "")).resolves.toBe("http://127.0.0.1:11434/v1");
  });
});
