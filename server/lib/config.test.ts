import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const environment = ["AUTH_MODE", "DATABASE_URL", "DOCKER", "ERD_INSTALL_MODE", "SUPABASE_URL", "VERCEL"] as const;
const original = Object.fromEntries(environment.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of environment) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

async function installMode(env: { DATABASE_URL: string; ERD_INSTALL_MODE?: string }, dockerenv = false) {
  for (const key of ["DOCKER", "ERD_INSTALL_MODE", "VERCEL"]) delete process.env[key];
  Object.assign(process.env, env);
  const existsSync = fs.existsSync;
  vi.spyOn(fs, "existsSync").mockImplementation((path) => (path === "/.dockerenv" ? dockerenv : existsSync(path)));
  vi.resetModules();
  const config = await import("./config.js");
  return { mode: config.getInstallMode(), desktopInstall: config.isDesktopInstall() };
}

describe("Install mode (BUG-104)", () => {
  const sqlite = "file:/app/data/erd-builder.db";
  const postgres = "postgresql://localhost/erd";

  it("takes the mode the Docker image declares, also where /.dockerenv is missing (Kiri, Podman, Kubernetes)", async () => {
    await expect(installMode({ DATABASE_URL: sqlite, ERD_INSTALL_MODE: "docker" })).resolves.toEqual({ mode: "docker", desktopInstall: false });
    await expect(installMode({ DATABASE_URL: postgres, ERD_INSTALL_MODE: "docker" })).resolves.toEqual({ mode: "docker", desktopInstall: false });
  });

  it("still detects Docker Engine from /.dockerenv", async () => {
    await expect(installMode({ DATABASE_URL: sqlite }, true)).resolves.toEqual({ mode: "docker", desktopInstall: false });
  });

  it("treats only the Desktop and CLI apps on SQLite as single-user installs", async () => {
    await expect(installMode({ DATABASE_URL: sqlite, ERD_INSTALL_MODE: "desktop" })).resolves.toEqual({ mode: "desktop", desktopInstall: true });
    await expect(installMode({ DATABASE_URL: sqlite, ERD_INSTALL_MODE: "cli" })).resolves.toEqual({ mode: "cli", desktopInstall: true });
    await expect(installMode({ DATABASE_URL: postgres, ERD_INSTALL_MODE: "cli" })).resolves.toEqual({ mode: "cli", desktopInstall: false });
    await expect(installMode({ DATABASE_URL: postgres })).resolves.toEqual({ mode: "web", desktopInstall: false });
  });
});

async function ssoMode(input: { databaseUrl: string; installMode?: string }) {
  process.env.AUTH_MODE = "sso";
  process.env.DATABASE_URL = input.databaseUrl;
  process.env.ERD_INSTALL_MODE = input.installMode || "";
  process.env.SUPABASE_URL = "";
  vi.resetModules();
  return (await import("./config.js")).isSsoAuthMode();
}

describe("SSO runtime mode", () => {
  it("keeps Desktop and CLI local even when a shared .env enables SSO", async () => {
    await expect(ssoMode({ databaseUrl: "file:./data.db", installMode: "desktop" })).resolves.toBe(false);
    await expect(ssoMode({ databaseUrl: "postgresql://localhost/erd", installMode: "cli" })).resolves.toBe(false);
  });

  it("enables SSO only for the Cloud PostgreSQL runtime", async () => {
    await expect(ssoMode({ databaseUrl: "postgresql://localhost/erd" })).resolves.toBe(true);
  });
});
