import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { OAuthError as McpOAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "../lib/prisma.js";
import type { PublicMcpConfig } from "./public-auth.js";

const AUTHORIZATION_TTL_MS = 10 * 60_000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

type OAuthDb = {
  mcpOAuthClient: any;
  mcpOAuthAuthorization: any;
  mcpOAuthToken: any;
  $transaction: (callback: (tx: OAuthDb) => Promise<unknown>) => Promise<unknown>;
};

function db(): OAuthDb {
  if (!prisma) throw new ServerError("OAuth database is unavailable");
  return prisma as unknown as OAuthDb;
}

function secret(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function hashOAuthSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseScopes(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

function validateScopes(requested: string[] | undefined, supported: string[]) {
  const scopes = requested?.length ? [...new Set(requested)] : supported;
  if (scopes.some(scope => !supported.includes(scope))) throw new InvalidScopeError("Unsupported OAuth scope");
  return scopes;
}

function validateResource(resource: URL | undefined, expected: URL): asserts resource is URL {
  if (!resource || resource.href !== expected.href) throw new InvalidTargetError("OAuth resource is invalid");
}

function validRedirectUri(value: string) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && loopback));
}

class LocalOAuthClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = await db().mcpOAuthClient.findUnique({ where: { id: clientId } });
    return row ? { ...(row.metadata as object), client_id: row.id } as OAuthClientInformationFull : undefined;
  }

  async registerClient(input: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    const generated = input as OAuthClientInformationFull;
    if (!generated.client_id) throw new InvalidClientMetadataError("OAuth client ID is missing");
    if (!generated.redirect_uris.length || generated.redirect_uris.length > 10 || !generated.redirect_uris.every(validRedirectUri)) {
      throw new InvalidClientMetadataError("Redirect URIs must use HTTPS or an HTTP loopback address");
    }
    const grantTypes = generated.grant_types?.length ? generated.grant_types : ["authorization_code", "refresh_token"];
    const responseTypes = generated.response_types?.length ? generated.response_types : ["code"];
    if (grantTypes.some(value => !["authorization_code", "refresh_token"].includes(value)) || responseTypes.some(value => value !== "code")) {
      throw new InvalidClientMetadataError("OAuth client requests an unsupported flow");
    }
    const authMethod = generated.token_endpoint_auth_method || (generated.client_secret ? "client_secret_post" : "none");
    if (!["none", "client_secret_post"].includes(authMethod)) {
      throw new InvalidClientMetadataError("OAuth client authentication method is unsupported");
    }
    const metadata: OAuthClientInformationFull = {
      ...generated,
      client_name: generated.client_name?.slice(0, 100) || "MCP client",
      token_endpoint_auth_method: authMethod,
      grant_types: grantTypes,
      response_types: responseTypes,
    };
    if (JSON.stringify(metadata).length > 16_384) throw new InvalidClientMetadataError("OAuth client metadata is too large");
    const storedMetadata = generated.client_secret
      ? { ...metadata, client_secret: hashOAuthSecret(generated.client_secret) }
      : metadata;
    await db().mcpOAuthClient.create({ data: { id: generated.client_id, metadata: JSON.parse(JSON.stringify(storedMetadata)) } });
    return metadata;
  }
}

export type LocalAuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  scope: string;
  client: { id: string; name: string; uri?: string };
};

export class LocalMcpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new LocalOAuthClientsStore();

  constructor(private readonly config: PublicMcpConfig) {}

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    validateResource(params.resource, this.config.resourceUrl);
    const scopes = validateScopes(params.scopes, this.config.scopes);
    const id = secret("mcp_auth_");
    await db().mcpOAuthAuthorization.create({
      data: {
        id,
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        scopes: scopes.join(" "),
        state: params.state,
        resource: this.config.resourceUrl.href,
        codeChallenge: params.codeChallenge,
        expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MS),
      },
    });
    const consentUrl = new URL(this.config.consentUrl.href);
    consentUrl.searchParams.set("authorization_id", id);
    res.redirect(302, consentUrl.href);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string) {
    const row = await this.findAuthorization(client.client_id, authorizationCode);
    return row.codeChallenge as string;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    validateResource(resource, this.config.resourceUrl);
    const row = await this.findAuthorization(client.client_id, authorizationCode);
    if (!redirectUri || redirectUri !== row.redirectUri || row.resource !== resource.href) {
      throw new InvalidGrantError("Authorization code binding is invalid");
    }
    const accessToken = secret("mcp_at_");
    const refreshToken = secret("mcp_rt_");
    const now = new Date();
    await db().$transaction(async tx => {
      const consumed = await tx.mcpOAuthAuthorization.updateMany({
        where: { id: row.id, status: "approved", consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new InvalidGrantError("Authorization code was already used");
      await this.storeTokenPair(tx, row, accessToken, refreshToken, now);
    });
    return this.tokenResponse(accessToken, refreshToken, row.scopes);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL) {
    validateResource(resource, this.config.resourceUrl);
    const now = new Date();
    const row = await db().mcpOAuthToken.findFirst({
      where: {
        tokenHash: hashOAuthSecret(refreshToken), kind: "refresh", clientId: client.client_id,
        revokedAt: null, expiresAt: { gt: now }, resource: resource.href,
      },
    });
    if (!row) throw new InvalidGrantError("Refresh token is invalid or expired");
    const grantedScopes = parseScopes(row.scopes);
    const nextScopes = scopes?.length ? validateScopes(scopes, grantedScopes) : grantedScopes;
    const accessToken = secret("mcp_at_");
    const nextRefreshToken = secret("mcp_rt_");
    await db().$transaction(async tx => {
      const revoked = await tx.mcpOAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now } });
      if (revoked.count !== 1) throw new InvalidGrantError("Refresh token was already used");
      await this.storeTokenPair(tx, { ...row, scopes: nextScopes.join(" ") }, accessToken, nextRefreshToken, now);
    });
    return this.tokenResponse(accessToken, nextRefreshToken, nextScopes.join(" "));
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = await db().mcpOAuthToken.findFirst({
      where: {
        tokenHash: hashOAuthSecret(token), kind: "access", revokedAt: null,
        expiresAt: { gt: new Date() }, resource: this.config.resourceUrl.href,
      },
    });
    if (!row) throw new McpOAuthError(OAuthErrorCode.InvalidToken, "Access token is invalid or expired");
    return {
      token,
      clientId: row.clientId,
      scopes: parseScopes(row.scopes),
      expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
      resource: this.config.resourceUrl,
      extra: { userId: row.userId },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    const token = await db().mcpOAuthToken.findFirst({
      where: { tokenHash: hashOAuthSecret(request.token), clientId: client.client_id },
    });
    if (token) await db().mcpOAuthToken.updateMany({ where: { grantId: token.grantId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async getAuthorization(id: string): Promise<LocalAuthorizationDetails | null> {
    const row = await db().mcpOAuthAuthorization.findFirst({
      where: { id, status: "pending", expiresAt: { gt: new Date() } }, include: { client: true },
    });
    if (!row) return null;
    const metadata = row.client.metadata as OAuthClientInformationFull;
    return {
      authorization_id: row.id,
      redirect_uri: row.redirectUri,
      scope: row.scopes,
      client: { id: row.clientId, name: metadata.client_name || "MCP client", uri: metadata.client_uri },
    };
  }

  async decideAuthorization(id: string, userId: string, action: "approve" | "deny") {
    const row = await db().mcpOAuthAuthorization.findFirst({
      where: { id, status: "pending", expiresAt: { gt: new Date() } },
    });
    if (!row) return null;
    const redirect = new URL(row.redirectUri);
    redirect.searchParams.set("iss", this.config.issuerUrl.href);
    if (row.state) redirect.searchParams.set("state", row.state);
    if (action === "deny") {
      const denied = await db().mcpOAuthAuthorization.updateMany({ where: { id, status: "pending" }, data: { status: "denied" } });
      if (denied.count !== 1) return null;
      redirect.searchParams.set("error", "access_denied");
      return redirect.href;
    }
    const code = secret("mcp_code_");
    const approved = await db().mcpOAuthAuthorization.updateMany({
      where: { id, status: "pending", expiresAt: { gt: new Date() } },
      data: { status: "approved", userId, codeHash: hashOAuthSecret(code), approvedAt: new Date() },
    });
    if (approved.count !== 1) return null;
    redirect.searchParams.set("code", code);
    return redirect.href;
  }

  private async findAuthorization(clientId: string, code: string) {
    const row = await db().mcpOAuthAuthorization.findFirst({
      where: {
        codeHash: hashOAuthSecret(code), clientId, status: "approved", consumedAt: null,
        expiresAt: { gt: new Date() }, userId: { not: null },
      },
    });
    if (!row) throw new InvalidGrantError("Authorization code is invalid or expired");
    return row;
  }

  private async storeTokenPair(tx: OAuthDb, source: any, accessToken: string, refreshToken: string, now: Date) {
    const grantId = source.grantId || source.id;
    await tx.mcpOAuthToken.createMany({ data: [
      {
        tokenHash: hashOAuthSecret(accessToken), kind: "access", grantId, clientId: source.clientId,
        userId: source.userId, scopes: source.scopes, resource: source.resource,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
      {
        tokenHash: hashOAuthSecret(refreshToken), kind: "refresh", grantId, clientId: source.clientId,
        userId: source.userId, scopes: source.scopes, resource: source.resource,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    ] });
  }

  private tokenResponse(accessToken: string, refreshToken: string, scopes: string): OAuthTokens {
    return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: scopes };
  }
}

let localProvider: LocalMcpOAuthProvider | null = null;

export function activateLocalMcpOAuth(config: PublicMcpConfig) {
  localProvider = new LocalMcpOAuthProvider(config);
  return localProvider;
}

export function getLocalMcpOAuthProvider() {
  return localProvider;
}
