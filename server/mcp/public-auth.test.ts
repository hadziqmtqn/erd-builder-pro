import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthError } from "@modelcontextprotocol/server";
import { authInfoFromClaims, getPublicMcpClientConfig, getPublicMcpConfig } from "./public-auth.js";
import { PUBLIC_MCP_TOOL_NAMES } from "./public-tools.js";
import { createPublicMcpRouter } from "./public-router.js";

describe("public MCP boundary", () => {
  const env = {
    NODE_ENV: "production",
    MCP_PUBLIC_URL: "https://app.example.com/api/mcp",
    SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
  } as NodeJS.ProcessEnv;

  afterEach(() => vi.unstubAllEnvs());

  it("uses one canonical resource URL and rejects tokens for another audience", () => {
    const config = getPublicMcpConfig(env)!;
    expect(config.resourceUrl.href).toBe("https://app.example.com/api/mcp");
    expect(authInfoFromClaims("token", {
      iss: "https://project.supabase.co/auth/v1",
      sub: "user-id",
      aud: "https://app.example.com/api/mcp",
      exp: Math.floor(Date.now() / 1000) + 60,
      client_id: "mcp-client",
      scope: "email",
    }, "user-id", config)).toMatchObject({ clientId: "mcp-client", scopes: ["email"], extra: { userId: "user-id" } });
    expect(() => authInfoFromClaims("token", {
      iss: "https://project.supabase.co/auth/v1",
      sub: "user-id",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
      client_id: "mcp-client",
    }, "user-id", config)).toThrow(OAuthError);
  });

  it("requires HTTPS for a deployed public endpoint", () => {
    expect(() => getPublicMcpConfig({ ...env, MCP_PUBLIC_URL: "http://app.example.com/api/mcp" })).toThrow(/HTTPS/);
    expect(() => getPublicMcpConfig({ ...env, VITE_SUPABASE_ANON_KEY: undefined })).toThrow(/server key/);
  });

  it("uses the built-in OAuth server for Pure PostgreSQL", () => {
    const localEnv = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db:5432/erdbpro",
      MCP_PUBLIC_URL: "https://mcp.example.com/api/mcp",
    } as NodeJS.ProcessEnv;
    const config = getPublicMcpConfig(localEnv)!;
    expect(config).toMatchObject({ authProvider: "local", scopes: ["mcp:read"] });
    expect(config.issuerUrl.href).toBe("https://mcp.example.com/");
    expect(config.consentUrl.href).toBe("https://mcp.example.com/oauth/consent");
    expect(getPublicMcpClientConfig(localEnv)).toEqual({
      mode: "web",
      transport: "streamable-http",
      configured: true,
      url: "https://mcp.example.com/api/mcp",
      authProvider: "local",
      scopes: ["mcp:read"],
    });
    expect(getPublicMcpClientConfig({ DATABASE_URL: localEnv.DATABASE_URL } as NodeJS.ProcessEnv))
      .toEqual({ mode: "web", transport: "streamable-http", configured: false });
  });

  it("keeps the public tool allowlist web-only and read-only", () => {
    expect(PUBLIC_MCP_TOOL_NAMES).toEqual(["workspace_list_files", "document_read", "history_list", "history_read"]);
    expect(PUBLIC_MCP_TOOL_NAMES.some(name => name.startsWith("db_") || name.endsWith("_apply"))).toBe(false);
  });

  it("keeps localhost app routes reachable while protecting public MCP routes", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@db:5432/erdbpro");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("MCP_AUTH_PROVIDER", "local");
    vi.stubEnv("MCP_PUBLIC_URL", "https://mcp.example.com/api/mcp");

    const app = express();
    app.use(createPublicMcpRouter()!);
    app.get("/", (_req, res) => res.send("web-app"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const localApp = await fetch(`${baseUrl}/`, { headers: { Host: "localhost:3000" } });
      expect(localApp.status).toBe(200);
      expect(await localApp.text()).toBe("web-app");

      const localMcp = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers: { Host: "localhost:3000", "Content-Type": "application/json" },
        body: "{}",
      });
      expect(localMcp.status).toBe(403);
      expect((await localMcp.json() as any).error.message).toMatch(/^Invalid Host:/);

      const localAuthorize = await fetch(`${baseUrl}/authorize`);
      expect(localAuthorize.status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
