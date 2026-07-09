import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import { supabase, isDesktopMode, isLocalPostgres, useLocalAuth } from "./config.js";
import { getSession } from "./desktop-auth.js";

/** Extract token: Bearer header first (explicit auth), cookie (implicit), query param (fallback). */
function extractToken(req: ExpressRequest): string | undefined {
  // Bearer token from Authorization header — explicit, always fresh
  const authHeader = req.headers.authorization as string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Cookie-based token (works for same-origin requests)
  const cookieToken = req.cookies.token as string | undefined;
  if (cookieToken) return cookieToken;

  // Query param token (used by /api/serve/* for cross-origin <img> loads)
  const queryToken = req.query.token as string | undefined;
  if (queryToken) return queryToken;

  return undefined;
}

// Auth Middleware
export const authenticate = async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Always try local auth first (self-host or Supabase with local sessions)
    if (useLocalAuth()) {
      const session = await getSession(token);
      if (session) {
        (req as any).user = { id: session.userId, email: session.email };
        next();
        return;
      }
    }

    // Fall through to Supabase auth (only if configured and token might be Supabase JWT)
    if (supabase && !useLocalAuth()) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: "Invalid session" });
      }
      (req as any).user = user;
      next();
      return;
    }

    // No valid auth method
    return res.status(401).json({ error: "Invalid session" });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Supabase health check middleware — skipped in desktop and local PG mode
export const checkSupabase = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!supabase) {
    if (isDesktopMode() || isLocalPostgres()) return next();
    return res.status(500).json({ 
      error: "Supabase configuration is missing or invalid. Please check your environment variables."
    });
  }
  next();
};
