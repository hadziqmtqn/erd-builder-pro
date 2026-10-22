import express from "express";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthError } from "@modelcontextprotocol/server";
import { authInfoFromClaims, getPublicMcpClientConfig, getPublicMcpConfig } from "./public-auth.js";
import { PUBLIC_MCP_TOOL_NAMES } from "./public-tools.js";
import { createPublicMcpRouter } from "./public-router.js";
import { LocalMcpOAuthProvider } from "./local-oauth.js";

describe("public MCP boundary", () => {
  const env = {
    NODE_ENV: "production",
    MCP_PUBLIC_URL: "https://app.example.com/api/mcp",
    SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
  } as NodeJS.ProcessEnv;

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

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
    expect(PUBLIC_MCP_TOOL_NAMES).toEqual(["workspace_list_files", "workspace_search", "document_read", "history_list", "history_read"]);
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

      const authInfo = {
        token: "test-token", clientId: "test-client", scopes: ["mcp:read"],
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        resource: new URL("https://other.example.com/api/mcp"), extra: { userId: "user-id" },
      };
      const verifier = vi.spyOn(LocalMcpOAuthProvider.prototype, "verifyAccessToken").mockResolvedValue(authInfo);
      const postMcp = (body: unknown) => new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const req = request(`${baseUrl}/api/mcp`, {
          method: "POST",
          headers: { Host: "mcp.example.com", Authorization: "Bearer test-token", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        }, res => {
          let body = "";
          res.on("data", chunk => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.end(JSON.stringify(body));
      });
      const wrongResource = await postMcp({});
      expect(verifier).toHaveBeenCalledOnce();
      expect(wrongResource.status).toBe(401);

      verifier.mockResolvedValue({ ...authInfo, resource: new URL("https://mcp.example.com/api/mcp") });
      const oversizedArguments = await postMcp({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "document_read", arguments: { type: "notes", uid: "doc", extra: Array(1001).fill(0) } },
      });
      expect(oversizedArguments.status).toBe(200);
      expect(oversizedArguments.body).toContain("maximum of 1000 elements");
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
