import { Router, type Request, type Response } from "express";
import { authenticate } from "../lib/middleware.js";
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, useLocalAuth } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getLocalMcpOAuthProvider } from "../mcp/local-oauth.js";

const router = Router();
const authorizationIdPattern = /^[A-Za-z0-9_-]{1,200}$/;

function accessToken(req: Request) {
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  return bearer || req.cookies.token as string | undefined;
}

async function proxyConsent(req: Request, res: Response, action?: "approve" | "deny") {
  const authorizationId = req.params.authorizationId;
  if (!authorizationIdPattern.test(authorizationId)) {
    res.status(404).json({ error: "OAuth authorization request not found" });
    return;
  }
  const localProvider = getLocalMcpOAuthProvider();
  if (localProvider) {
    try {
      if (!req.headers.authorization?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Bearer authentication required" });
        return;
      }
      const user = (req as Request & { user?: { id?: string; email?: string } }).user;
      if (!user?.id) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const details = await localProvider.getAuthorization(authorizationId);
      if (!details) {
        res.status(404).json({ error: "OAuth authorization request not found or expired" });
        return;
      }
      if (!action) {
        res.set("Cache-Control", "no-store").json({ ...details, user: { id: user.id, email: user.email || "" } });
        return;
      }
      const redirectUrl = await localProvider.decideAuthorization(authorizationId, user.id, action);
      if (!redirectUrl) {
        res.status(409).json({ error: "OAuth authorization request was already decided" });
        return;
      }
      res.set("Cache-Control", "no-store").json({ redirect_url: redirectUrl });
    } catch (error) {
      logger.warn({ err: error }, "Local MCP OAuth consent request failed");
      res.status(500).json({ error: "OAuth authorization service is unavailable" });
    }
    return;
  }
  if (useLocalAuth() || !SUPABASE_URL) {
    res.status(404).json({ error: "OAuth authorization request not found" });
    return;
  }
  const token = accessToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const url = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}${action ? "/consent" : ""}`;
    const response = await fetch(url, {
      method: action ? "POST" : "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
        ...(action ? { "Content-Type": "application/json" } : {}),
      },
      ...(action ? { body: JSON.stringify({ action }) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      res.status(response.status >= 400 && response.status < 500 ? response.status : 502)
        .json({ error: "OAuth authorization request is invalid or expired" });
      return;
    }
    res.set("Cache-Control", "no-store").json(data);
  } catch (error) {
    logger.warn({ err: error }, "Supabase OAuth consent request failed");
    res.status(502).json({ error: "OAuth authorization service is unavailable" });
  }
}

router.get("/oauth/authorizations/:authorizationId", authenticate, (req, res) => { void proxyConsent(req, res); });
router.post("/oauth/authorizations/:authorizationId/approve", authenticate, (req, res) => { void proxyConsent(req, res, "approve"); });
router.post("/oauth/authorizations/:authorizationId/deny", authenticate, (req, res) => { void proxyConsent(req, res, "deny"); });

export default router;
