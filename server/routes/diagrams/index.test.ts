import express from "express";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// BUG-105: live schema and connection tests are DB Client features, so they answer only in Desktop and CLI.
// The real router, desktopOnly, install-mode detection and controllers run against a SQLite fixture;
// authentication is a stub and the two controllers are spied on.

const mocks = vi.hoisted(() => {
  // config.ts reads SUPABASE_URL once on import; keep it empty so DATABASE_URL decides the mode.
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  // connections/middleware.ts runs the legacy Desktop migration on import; a PostgreSQL URL skips it.
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db:5432/erdbpro");
  return { authenticate: vi.fn((_req: any, _res: any, next: () => void) => next()) };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/middleware.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/middleware.js")>(),
  authenticate: mocks.authenticate,
}));
vi.mock("./controller.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./controller.js")>();
  return { ...actual, fetchSchema: vi.fn(actual.fetchSchema), testDbConnection: vi.fn(actual.testDbConnection) };
});

const ctrl = await import("./controller.js");
const { default: diagramsRouter } = await import("./index.js");
const { getInstallMode, isSsoAuthMode } = await import("../../lib/config.js");

const POSTGRES_URL = "postgresql://user:pass@db:5432/erdbpro";
const SQLITE_URL = "file:./erdbpro.db";

const MODES = [
  { name: "web", env: { DATABASE_URL: POSTGRES_URL }, installMode: "web", sso: false },
  { name: "docker", env: { DATABASE_URL: POSTGRES_URL, DOCKER: "1" }, installMode: "docker", sso: false },
  { name: "Cloud", env: { DATABASE_URL: POSTGRES_URL, DOCKER: "1", AUTH_MODE: "sso" }, installMode: "docker", sso: true },
  // Desktop and CLI launchers set ERD_INSTALL_MODE themselves (src-tauri/src/lib.rs, cli/src/cli.mjs).
  { name: "desktop", env: { DATABASE_URL: SQLITE_URL, ERD_INSTALL_MODE: "desktop" }, installMode: "desktop", sso: false },
  { name: "cli", env: { DATABASE_URL: SQLITE_URL, ERD_INSTALL_MODE: "cli" }, installMode: "cli", sso: false },
] as const;

const dir = fs.mkdtempSync(join(tmpdir(), "erd-bug105-"));
const fixture = { type: "sqlite", database: join(dir, "shop.db") };

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const db = new (await initSqlJs()).Database();
  db.run("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
  fs.writeFileSync(fixture.database, db.export());
  db.close();

  const app = express();
  app.use(express.json());
  // Mounted at /api/diagrams in server/index.ts.
  app.use("/api/diagrams", diagramsRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
});

function stubMode(env: Record<string, string>) {
  // Clear what a developer shell or .env could set, so only this case decides the install mode.
  for (const key of ["ERD_INSTALL_MODE", "VERCEL", "DOCKER", "AUTH_MODE"]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

function post(path: string) {
  return fetch(`${baseUrl}/api/diagrams/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fixture),
  });
}

describe.each(MODES.filter(mode => mode.installMode !== "desktop" && mode.installMode !== "cli"))(
  "BUG-105 DB Client routes in $name mode",
  mode => {
    it("answer the generic not-found before any controller runs", async () => {
      stubMode(mode.env);
      expect(getInstallMode()).toBe(mode.installMode);
      expect(isSsoAuthMode()).toBe(mode.sso);

      for (const path of ["fetch-schema", "test-db-connection"]) {
        const response = await post(path);
        expect(response.status, path).toBe(404);
        expect(await response.json(), path).toEqual({ error: "Not available" });
      }
      expect(mocks.authenticate).toHaveBeenCalledTimes(2);
      expect(ctrl.fetchSchema).not.toHaveBeenCalled();
      expect(ctrl.testDbConnection).not.toHaveBeenCalled();
    });
  },
);

describe.each(MODES.filter(mode => mode.installMode === "desktop" || mode.installMode === "cli"))(
  "BUG-105 DB Client routes in $name mode",
  mode => {
    it("still fetch the live schema and test the connection", async () => {
      stubMode(mode.env);
      expect(getInstallMode()).toBe(mode.installMode);

      const schemaResponse = await post("fetch-schema");
      expect(schemaResponse.status).toBe(200);
      const { schema } = await schemaResponse.json();
      expect(schema.map((table: { table_name: string }) => table.table_name)).toEqual(["customers"]);

      const testResponse = await post("test-db-connection");
      expect(testResponse.status).toBe(200);
      expect(await testResponse.json()).toEqual({ success: true, message: expect.stringMatching(/^OK/) });

      expect(ctrl.fetchSchema).toHaveBeenCalledTimes(1);
      expect(ctrl.testDbConnection).toHaveBeenCalledTimes(1);
    });
  },
);
