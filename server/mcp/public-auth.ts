import { decode, type JwtPayload } from "jsonwebtoken";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { supabase } from "../lib/config.js";

export type PublicMcpConfig = {
  resourceUrl: URL;
  issuerUrl: URL;
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

  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  if (!supabaseUrl) throw new Error("MCP_PUBLIC_URL requires Supabase Auth");
  if (!(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("MCP_PUBLIC_URL requires a Supabase server key");
  }

  const resourceUrl = canonicalUrl(publicUrl, "MCP_PUBLIC_URL", env);
  const defaultIssuer = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  const issuerUrl = canonicalUrl(env.MCP_AUTH_ISSUER_URL?.trim() || defaultIssuer, "MCP_AUTH_ISSUER_URL", env);
  return { resourceUrl, issuerUrl, scopes: ["email"] };
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
