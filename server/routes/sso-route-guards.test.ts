import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// CLD-008F: Backup, Export data and Import data must stay unavailable in Cloud (AUTH_MODE=sso).
// The real routers and the real rejectInSsoMode run; authentication, the admin guard and the
// controllers are spies, so the tests need no database.

const mocks = vi.hoisted(() => {
  // config.ts reads SUPABASE_URL once on import; keep it empty so DATABASE_URL decides the mode.
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  const handler = () => vi.fn((_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(200).json({ ok: true });
  });
  return {
    authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
    requireAdmin: vi.fn((_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
      res.status(403).json({ error: "Forbidden" });
    }),
    backups: {
      getFolderSettings: handler(), updateFolderSettings: handler(), list: handler(),
      download: handler(), create: handler(), importDatabase: handler(), restore: handler(),
    },
    autoBackups: { getSettings: handler(), updateSettings: handler() },
    guestImport: { exportHandler: handler(), importHandler: handler() },
  };
});

vi.mock("../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../lib/middleware.js", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/middleware.js")>(),
  authenticate: mocks.authenticate,
}));
vi.mock("../lib/security.js", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./connections/middleware.js", () => ({ desktopOnly: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("./backups/controller.js", () => mocks.backups);
vi.mock("./backups/auto-controller.js", () => mocks.autoBackups);
vi.mock("./guest-import/controller.js", () => mocks.guestImport);

const { default: backupsRouter } = await import("./backups/index.js");
const { default: guestImportRouter } = await import("./guest-import/index.js");

// Mounted at the same paths as server/index.ts.
const ROUTES: Array<[method: "GET" | "PUT" | "POST", path: string]> = [
  ["GET", "/api/backups/settings/folder"],
  ["PUT", "/api/backups/settings/folder"],
  ["GET", "/api/backups/settings/auto"],
  ["PUT", "/api/backups/settings/auto"],
  ["GET", "/api/backups"],
  ["GET", "/api/backups/1/download"],
  ["POST", "/api/backups"],
  ["POST", "/api/backups/import"],
  ["POST", "/api/backups/1/restore"],
  ["GET", "/api/guest/export"],
  ["POST", "/api/guest/import"],
];

const controllers = () => [
  ...Object.values(mocks.backups), ...Object.values(mocks.autoBackups), ...Object.values(mocks.guestImport),
];

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use("/api/backups", backupsRouter);
  app.use("/api/guest", guestImportRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
});

const send = ([method, path]: (typeof ROUTES)[number]) => fetch(`${baseUrl}${path}`, { method });

describe("CLD-008F Import, Export and Backup routes in Cloud mode", () => {
  it("returns the generic not-found for every route and never reaches the admin guard or a controller", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db:5432/erdbpro");
    vi.stubEnv("AUTH_MODE", "sso");
    vi.stubEnv("ERD_INSTALL_MODE", "");

    for (const route of ROUTES) {
      const response = await send(route);
      expect(response.status, route.join(" ")).toBe(404);
      expect(await response.json(), route.join(" ")).toEqual({ error: "Not found" });
    }
    expect(mocks.authenticate).toHaveBeenCalledTimes(ROUTES.length);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    for (const controller of controllers()) expect(controller).not.toHaveBeenCalled();
  });

  it("lets local PostgreSQL requests pass rejectInSsoMode and reach the admin guard", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db:5432/erdbpro");
    vi.stubEnv("AUTH_MODE", "");
    vi.stubEnv("ERD_INSTALL_MODE", "");

    for (const route of ROUTES) {
      const response = await send(route);
      expect(response.status, route.join(" ")).toBe(403);
      expect(await response.json(), route.join(" ")).toEqual({ error: "Forbidden" });
    }
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(ROUTES.length);
    for (const controller of controllers()) expect(controller).not.toHaveBeenCalled();
  });
});
