import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import { supabase, isDesktopMode, isLocalPostgres } from "./config.js";
import { getSession } from "./desktop-auth.js";

/** Extract token from cookie (preferred) or Authorization header (fallback). */
function extractToken(req: ExpressRequest): string | undefined {
  // Cookie-based token (works for same-origin requests)
  const cookieToken = req.cookies.token as string | undefined;
  if (cookieToken) return cookieToken;

  // Bearer token from Authorization header (works for cross-origin Tauri requests)
  const authHeader = req.headers.authorization as string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return undefined;
}

// Auth Middleware
export const authenticate = async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (isDesktopMode() || isLocalPostgres()) {
      const session = await getSession(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }
      (req as any).user = { id: session.userId, email: session.email };
      next();
      return;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }
    (req as any).user = user;
    next();
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
