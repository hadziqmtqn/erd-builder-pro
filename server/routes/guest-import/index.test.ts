import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// CLD-008F: Export data and Import data must stay unavailable in Cloud (AUTH_MODE=sso). The real
// router and the real rejectInSsoMode run; authentication, the admin guard and the controllers are
// spies, so no database.

const mocks = vi.hoisted(() => {
  // config.ts reads SUPABASE_URL once on import; keep it empty so DATABASE_URL decides the mode.
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  return {
    authenticate: vi.fn((_req: any, _res: any, next: () => void) => next()),
    requireAdmin: vi.fn((_req: any, res: any) => res.status(403).json({ error: "Forbidden" })),
    exportHandler: vi.fn((_req: any, res: any) => res.json({ ok: true })),
    importHandler: vi.fn((_req: any, res: any) => res.json({ ok: true })),
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/middleware.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/middleware.js")>(),
  authenticate: mocks.authenticate,
}));
vi.mock("../../lib/security.js", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./controller.js", () => ({ exportHandler: mocks.exportHandler, importHandler: mocks.importHandler }));

const { default: guestImportRouter } = await import("./index.js");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  // Mounted at /api/guest in server/index.ts.
  app.use("/api/guest", guestImportRouter);
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

describe.each([
  { name: "Export data", method: "GET", path: "/api/guest/export", controller: mocks.exportHandler },
  { name: "Import data", method: "POST", path: "/api/guest/import", controller: mocks.importHandler },
])("CLD-008F $name ($method $path) guard", ({ method, path, controller }) => {
  it("returns the generic not-found in Cloud mode before the admin guard or the controller runs", async () => {
    stubMode("sso");
    const response = await fetch(`${baseUrl}${path}`, { method });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(controller).not.toHaveBeenCalled();
  });

  it("lets a local PostgreSQL request pass the SSO guard and reach requireAdmin", async () => {
    stubMode("");
    const response = await fetch(`${baseUrl}${path}`, { method });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(controller).not.toHaveBeenCalled();
  });
});
