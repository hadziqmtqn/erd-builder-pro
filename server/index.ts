// BigInt serialization fix for Prisma — JSON.stringify cannot handle BigInt by default.
// Keep them as strings so IDs are never rounded beyond JS safe integer range.
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { checkSupabase } from "./lib/middleware.js";
import { httpLogger } from "./lib/logger.js";
import authRouter from "./routes/auth.js";
import diagramsRouter from "./routes/diagrams.js";
import projectsRouter from "./routes/projects.js";
import notesRouter from "./routes/notes.js";
import drawingsRouter from "./routes/drawings.js";
import flowchartsRouter from "./routes/flowcharts.js";
import feedbackRouter from "./routes/feedback.js";
import backupsRouter from "./routes/backups.js";
import commonRouter from "./routes/common.js";
import aiRouter from "./routes/ai.js";
import aiSettingsRouter from "./routes/ai-settings.js";
import aiChatRouter from "./routes/ai-chat.js";
import guestImportRouter from "./routes/guest-import.js";

const app = express();

// Trust proxy for Vercel (X-Forwarded-For) — required by express-rate-limit
app.set('trust proxy', 1);

// Security headers — relaxed CSP for Vite dev + app requirements
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "*"],
      connectSrc: ["'self'", "*"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    reportOnly: !isProd,
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — configurable via CORS_ORIGINS env var
// In production, Vercel domains (*.vercel.app) are allowed by default
// Set CORS_ORIGINS="https://yourdomain.com,https://www.yourdomain.com" for custom domains
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    
    // Dev mode: allow all origins
    if (process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }
    
    // Tauri desktop: allow custom protocol
    if (origin.startsWith("tauri://")) {
      return callback(null, true);
    }
    
    // Localhost: allow for local testing
    if (
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    ) {
      return callback(null, true);
    }
    
    // Vercel domains: allow all *.vercel.app subdomains
    const url = new URL(origin);
    if (url.hostname.endsWith(".vercel.app")) {
      return callback(null, true);
    }
    
    // Custom domains: check CORS_ORIGINS env var
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

// Global rate limiter — 200 req/min per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api", globalLimiter);

// Strict rate limiter for auth endpoints — 10 req/min per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
});
app.use("/api/login", authLimiter);

// AI proxy rate limiter — 30 req/min per IP (guest mode is unauthenticated)
const aiProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI request limit exceeded, please try again later" },
});
app.use("/api/ai/proxy", aiProxyLimiter);

// Upload rate limiter — 20 req/min per IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit exceeded, please try again later" },
});
app.use("/api/upload", uploadLimiter);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));
app.use(cookieParser());

// Response field name conversion: Prisma returns camelCase, but frontend expects
// snake_case (matching the original Supabase API format). This middleware intercepts
// res.json() and converts all object keys from camelCase to snake_case.
function camelToSnake(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(camelToSnake);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = camelToSnake(value);
  }
  return result;
}

app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    return originalJson(camelToSnake(body));
  } as typeof res.json;
  next();
});

// Structured request logging (via Pino)
app.use(httpLogger);

app.use("/api/*", (req, res, next) => {
  const path = req.originalUrl.split("?")[0];
  if (["/api/auth-config", "/api/login", "/api/logout", "/api/me"].includes(path)) {
    return next();
  }
  checkSupabase(req, res, next);
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", authRouter);
app.use("/api/diagrams", diagramsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/drawings", drawingsRouter);
app.use("/api/flowcharts", flowchartsRouter);
app.use("/api/backups", backupsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/ai/settings", aiSettingsRouter);
app.use("/api/ai/chat", aiChatRouter);
app.use("/api/ai/rules", (await import("./routes/ai-rules.js")).default);
app.use("/api", feedbackRouter);
app.use("/api", commonRouter);
app.use("/api/guest", guestImportRouter);

app.use("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

export default app;
