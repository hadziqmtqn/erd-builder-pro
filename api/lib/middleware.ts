import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config";

// Auth Middleware
export const authenticate = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Supabase health check middleware
export const checkSupabase = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  if (!supabase) {
    return res.status(500).json({ 
      error: "Supabase configuration is missing or invalid. Please check your environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
      configStatus: {
        url: !!SUPABASE_URL,
        key: !!SUPABASE_SERVICE_ROLE_KEY
      }
    });
  }
  next();
};
