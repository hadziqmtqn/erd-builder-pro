import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import { supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, isDesktopMode } from "./config.js";
import { getSession } from "./desktop-auth.js";

// Auth Middleware
export const authenticate = async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const token = req.cookies.token as string | undefined;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (isDesktopMode()) {
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

// Supabase health check middleware — skipped in desktop mode
export const checkSupabase = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!supabase) {
    if (isDesktopMode()) return next();
    return res.status(500).json({ 
      error: "Supabase configuration is missing or invalid. Please check your environment variables."
    });
  }
  next();
};
