import { afterEach, describe, expect, it, vi } from "vitest";

const environment = ["AUTH_MODE", "DATABASE_URL", "ERD_INSTALL_MODE", "SUPABASE_URL"] as const;
const original = Object.fromEntries(environment.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of environment) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
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
