import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config.js";

// Auth Middleware
export const authenticate = async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }
    // Attach user to req for routes to use
    (req as any).user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Supabase health check middleware
export const checkSupabase = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!supabase) {
    return res.status(500).json({ 
      error: "Supabase configuration is missing or invalid. Please check your environment variables."
    });
  }
  next();
};
