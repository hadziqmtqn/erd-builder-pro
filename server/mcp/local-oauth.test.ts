import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => {
  const clients = new Map<string, any>();
  const authorizations = new Map<string, any>();
  const tokens = new Map<string, any>();
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (value && typeof value === "object" && "gt" in value) return row[key] > value.gt;
    if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
    return row[key] === value;
  });
  const db: any = {
    mcpOAuthClient: {
      findUnique: async ({ where }: any) => clients.get(where.id) || null,
      create: async ({ data }: any) => { clients.set(data.id, { ...data }); return data; },
    },
    mcpOAuthAuthorization: {
      create: async ({ data }: any) => { authorizations.set(data.id, { ...data, status: "pending", consumedAt: null }); return data; },
      findFirst: async ({ where, include }: any) => {
        const row = [...authorizations.values()].find(value => matches(value, where));
        return row && include?.client ? { ...row, client: clients.get(row.clientId) } : row || null;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = [...authorizations.values()].filter(value => matches(value, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    mcpOAuthToken: {
      findFirst: async ({ where }: any) => [...tokens.values()].find(value => matches(value, where)) || null,
      createMany: async ({ data }: any) => {
        data.forEach((row: any) => tokens.set(row.tokenHash, { id: `token-${tokens.size + 1}`, revokedAt: null, ...row }));
        return { count: data.length };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = [...tokens.values()].filter(value => matches(value, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      },
    },
  };
  db.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(db);
  return { clients, authorizations, tokens, db };
});

vi.mock("../lib/prisma.js", () => ({ prisma: memory.db }));

import { hashOAuthSecret, LocalMcpOAuthProvider } from "./local-oauth.js";

describe("local MCP OAuth", () => {
  beforeEach(() => {
    memory.clients.clear();
    memory.authorizations.clear();
    memory.tokens.clear();
  });

  it("completes consent, one-time code exchange, refresh rotation, verification, and revocation", async () => {
    const resourceUrl = new URL("https://mcp.example.com/api/mcp");
    const provider = new LocalMcpOAuthProvider({
      authProvider: "local",
      resourceUrl,
      issuerUrl: new URL("https://mcp.example.com/"),
      consentUrl: new URL("https://app.example.com/oauth/consent"),
      scopes: ["mcp:read"],
    });
    const client = await provider.clientsStore.registerClient!({
      client_id: "agent-client",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: "AI Agent",
      redirect_uris: ["https://agent.example.com/callback"],
      token_endpoint_auth_method: "none",
    } as any);
    const confidential = await provider.clientsStore.registerClient!({
      client_id: "confidential-agent",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret: "raw-client-secret",
      redirect_uris: ["https://agent.example.com/confidential-callback"],
      token_endpoint_auth_method: "client_secret_post",
    } as any);
    expect(confidential.client_secret).toBe("raw-client-secret");
    expect((await provider.clientsStore.getClient("confidential-agent"))?.client_secret)
      .toBe(hashOAuthSecret("raw-client-secret"));
    let consentRedirect = "";
    await provider.authorize(client, {
      redirectUri: client.redirect_uris[0],
      codeChallenge: "challenge",
      scopes: ["mcp:read"],
      state: "state-1",
      resource: resourceUrl,
    }, { redirect: (_status: number, url: string) => { consentRedirect = url; } } as any);

    const authorizationId = new URL(consentRedirect).searchParams.get("authorization_id")!;
    expect((await provider.getAuthorization(authorizationId))?.client.name).toBe("AI Agent");
    const callback = new URL((await provider.decideAuthorization(authorizationId, "user-1", "approve"))!);
    const code = callback.searchParams.get("code")!;
    expect(callback.searchParams.get("iss")).toBe("https://mcp.example.com/");
    expect(await provider.challengeForAuthorizationCode(client, code)).toBe("challenge");

    const first = await provider.exchangeAuthorizationCode(client, code, undefined, client.redirect_uris[0], resourceUrl);
    expect((await provider.verifyAccessToken(first.access_token)).extra).toEqual({ userId: "user-1" });
    await expect(provider.exchangeAuthorizationCode(client, code, undefined, client.redirect_uris[0], resourceUrl)).rejects.toThrow();

    const refreshed = await provider.exchangeRefreshToken(client, first.refresh_token!, undefined, resourceUrl);
    await expect(provider.exchangeRefreshToken(client, first.refresh_token!, undefined, resourceUrl)).rejects.toThrow();
    await provider.revokeToken!(client, { token: refreshed.access_token });
    await expect(provider.verifyAccessToken(refreshed.access_token)).rejects.toThrow();
  });

});
