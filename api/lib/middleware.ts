import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config.js";

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
    const errorDetails = {
      error: "Supabase configuration is missing or invalid in the backend.",
      hint: "Check environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) in Vercel Project Settings.",
      configStatus: {
        url: !!SUPABASE_URL,
        key: !!SUPABASE_SERVICE_ROLE_KEY,
        env: process.env.NODE_ENV
      },
      requestedPath: req.originalUrl
    };
    
    console.error("Supabase health check failed for path:", req.originalUrl, errorDetails);
    
    return res.status(500).json(errorDetails);
  }
  next();
};
