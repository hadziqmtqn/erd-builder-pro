import { describe, expect, it } from "vitest";
import { OAuthError } from "@modelcontextprotocol/server";
import { authInfoFromClaims, getPublicMcpConfig } from "./public-auth.js";
import { PUBLIC_MCP_TOOL_NAMES } from "./public-tools.js";

describe("public MCP boundary", () => {
  const env = {
    NODE_ENV: "production",
    MCP_PUBLIC_URL: "https://app.example.com/api/mcp",
    SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
  } as NodeJS.ProcessEnv;

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
    const config = getPublicMcpConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db:5432/erdbpro",
      MCP_PUBLIC_URL: "https://mcp.example.com/api/mcp",
    } as NodeJS.ProcessEnv)!;
    expect(config).toMatchObject({ authProvider: "local", scopes: ["mcp:read"] });
    expect(config.issuerUrl.href).toBe("https://mcp.example.com/");
    expect(config.consentUrl.href).toBe("https://mcp.example.com/oauth/consent");
  });

  it("keeps the public tool allowlist web-only and read-only", () => {
    expect(PUBLIC_MCP_TOOL_NAMES).toEqual(["workspace_list_files", "document_read", "history_list", "history_read"]);
    expect(PUBLIC_MCP_TOOL_NAMES.some(name => name.startsWith("db_") || name.endsWith("_apply"))).toBe(false);
  });
});
