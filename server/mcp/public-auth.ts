import { decode, type JwtPayload } from "jsonwebtoken";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { supabase } from "../lib/config.js";

export type PublicMcpConfig = {
  authProvider: "local" | "supabase";
  resourceUrl: URL;
  issuerUrl: URL;
  consentUrl: URL;
  scopes: string[];
};

function canonicalUrl(raw: string, name: string, env: NodeJS.ProcessEnv) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.search || url.hash) throw new Error(`${name} must not contain a query string or fragment`);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && local)) {
    throw new Error(`${name} must use HTTPS outside local development`);
  }
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

export function getPublicMcpConfig(env: NodeJS.ProcessEnv = process.env): PublicMcpConfig | null {
  const publicUrl = env.MCP_PUBLIC_URL?.trim();
  if (!publicUrl) return null;

  const resourceUrl = canonicalUrl(publicUrl, "MCP_PUBLIC_URL", env);
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const configuredProvider = env.MCP_AUTH_PROVIDER?.trim() || (supabaseUrl ? "supabase" : "local");
  if (configuredProvider !== "local" && configuredProvider !== "supabase") {
    throw new Error("MCP_AUTH_PROVIDER must be local or supabase");
  }
  if (configuredProvider === "supabase") {
    if (!supabaseUrl || !(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
      throw new Error("Supabase MCP OAuth requires SUPABASE_URL and a Supabase server key");
    }
    const issuerUrl = canonicalUrl(
      env.MCP_AUTH_ISSUER_URL?.trim() || `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`,
      "MCP_AUTH_ISSUER_URL",
      env,
    );
    return { authProvider: "supabase", resourceUrl, issuerUrl, consentUrl: new URL("/oauth/consent", resourceUrl), scopes: ["email"] };
  }
  if (!(env.DATABASE_URL || "").startsWith("postgresql://")) {
    throw new Error("Local MCP OAuth requires Pure PostgreSQL");
  }
  if (supabaseUrl) throw new Error("Local MCP OAuth cannot be combined with Supabase Auth");
  const issuerUrl = new URL("/", resourceUrl);
  const consentUrl = canonicalUrl(env.MCP_CONSENT_URL?.trim() || new URL("/oauth/consent", resourceUrl).href, "MCP_CONSENT_URL", env);
  return { authProvider: "local", resourceUrl, issuerUrl, consentUrl, scopes: ["mcp:read"] };
}

export function getPublicMcpClientConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = getPublicMcpConfig(env);
  return {
    mode: "web" as const,
    transport: "streamable-http" as const,
    configured: Boolean(config),
    ...(config ? {
      url: config.resourceUrl.href,
      authProvider: config.authProvider,
      scopes: config.scopes,
    } : {}),
  };
}

function invalidToken(message: string): never {
  throw new OAuthError(OAuthErrorCode.InvalidToken, message);
}

export function authInfoFromClaims(
  token: string,
  claims: JwtPayload,
  userId: string,
  config: PublicMcpConfig,
): AuthInfo {
  if (claims.iss !== config.issuerUrl.href.replace(/\/$/, "")) invalidToken("Token issuer is invalid");
  if (claims.sub !== userId) invalidToken("Token subject is invalid");
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!audiences.includes(config.resourceUrl.href)) invalidToken("Token audience is invalid");
  if (typeof claims.exp !== "number") invalidToken("Token expiration is missing");
  const clientId = typeof claims.client_id === "string" ? claims.client_id : "";
  if (!clientId) invalidToken("OAuth client ID is missing");
  const scopes = typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : [];

  return {
    token,
    clientId,
    scopes,
    expiresAt: claims.exp,
    resource: config.resourceUrl,
    extra: { userId },
  };
}

export function createSupabaseMcpTokenVerifier(config: PublicMcpConfig): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token) {
      if (!supabase) invalidToken("Supabase Auth is unavailable");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) invalidToken("Token is invalid or expired");
      const claims = decode(token);
      if (!claims || typeof claims === "string") invalidToken("Token claims are invalid");
      return authInfoFromClaims(token, claims, String(user.id), config);
    },
  };
}
