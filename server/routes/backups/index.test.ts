import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// CLD-008F: Backup must stay unavailable in Cloud (AUTH_MODE=sso). The real router and the real
// rejectInSsoMode run; authentication, the admin guard and the controllers are spies, so no database.

const mocks = vi.hoisted(() => {
  // config.ts reads SUPABASE_URL once on import; keep it empty so DATABASE_URL decides the mode.
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  const handler = () => vi.fn((_req: any, res: any) => res.json({ ok: true }));
  return {
    authenticate: vi.fn((_req: any, _res: any, next: () => void) => next()),
    requireAdmin: vi.fn((_req: any, res: any) => res.status(403).json({ error: "Forbidden" })),
    controller: {
      getFolderSettings: handler(), updateFolderSettings: handler(), list: handler(),
      download: handler(), create: handler(), importDatabase: handler(), restore: handler(),
    },
    autoController: { getSettings: handler(), updateSettings: handler() },
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/middleware.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/middleware.js")>(),
  authenticate: mocks.authenticate,
}));
vi.mock("../../lib/security.js", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../connections/middleware.js", () => ({ desktopOnly: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("./controller.js", () => mocks.controller);
vi.mock("./auto-controller.js", () => mocks.autoController);

const { default: backupsRouter } = await import("./index.js");

const ROUTES = [
  ["GET", "/api/backups/settings/folder"],
  ["PUT", "/api/backups/settings/folder"],
  ["GET", "/api/backups/settings/auto"],
  ["PUT", "/api/backups/settings/auto"],
  ["GET", "/api/backups"],
  ["GET", "/api/backups/1/download"],
  ["POST", "/api/backups"],
  ["POST", "/api/backups/import"],
  ["POST", "/api/backups/1/restore"],
] as const;

const controllers = [...Object.values(mocks.controller), ...Object.values(mocks.autoController)];

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use("/api/backups", backupsRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
});

function stubMode(authMode: string) {
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db:5432/erdbpro");
  vi.stubEnv("ERD_INSTALL_MODE", "web");
  vi.stubEnv("AUTH_MODE", authMode);
}

describe("CLD-008F /api/backups guard", () => {
  it("returns the generic not-found in Cloud mode before the admin guard or any controller runs", async () => {
    stubMode("sso");
    for (const [method, path] of ROUTES) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.json(), `${method} ${path}`).toEqual({ error: "Not found" });
    }
    expect(mocks.authenticate).toHaveBeenCalledTimes(ROUTES.length);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    for (const controller of controllers) expect(controller).not.toHaveBeenCalled();
  });

  it("lets local PostgreSQL requests pass the SSO guard and reach requireAdmin", async () => {
    stubMode("");
    for (const [method, path] of ROUTES) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.json(), `${method} ${path}`).toEqual({ error: "Forbidden" });
    }
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(ROUTES.length);
    for (const controller of controllers) expect(controller).not.toHaveBeenCalled();
  });
});
