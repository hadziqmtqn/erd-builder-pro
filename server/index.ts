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
import { isDesktopMode } from "./lib/config.js";
import authRouter from "./routes/auth/index.js";
import diagramsRouter from "./routes/diagrams/index.js";
import projectsRouter from "./routes/projects/index.js";
import searchRouter from "./routes/search/index.js";
import notesRouter from "./routes/notes/index.js";
import drawingsRouter from "./routes/drawings/index.js";
import flowchartsRouter from "./routes/flowcharts/index.js";
import feedbackRouter from "./routes/feedback/index.js";
import backupsRouter from "./routes/backups/index.js";
import { initAutoBackupScheduler } from "./lib/auto-backup-init.js";
import commonRouter from "./routes/common/index.js";
import aiRouter from "./routes/ai/index.js";
import aiSettingsRouter from "./routes/ai-settings/index.js";
import aiChatRouter from "./routes/ai-chat/index.js";
import guestImportRouter from "./routes/guest-import/index.js";
import desktopImportRouter from "./routes/desktop-import/index.js";
import connectionsRouter from "./routes/connections/index.js";
import storageRouter from "./routes/storage/index.js";
import entityChangesRouter from "./routes/entity-changes/index.js";
import oauthConsentRouter from "./routes/oauth-consent.js";
import { createPublicMcpRouter } from "./mcp/public-router.js";

const app = express();

// Trust proxy for Vercel (X-Forwarded-For) — required by express-rate-limit
app.set('trust proxy', 1);

// Security headers
const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // Excalidraw loads fonts via esm.sh CDN
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://esm.sh"],
      imgSrc: ["'self'", "data:", "blob:", "*"],
      connectSrc: ["'self'", "*"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
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
    
    // Desktop mode: backend runs locally on the same machine as the
    // frontend (Tauri webview). The Origin header varies across platforms
    // and Tauri versions — it can be tauri://, https://tauri.localhost,
    // file://, or even null. There is no cross-origin risk when both
    // frontend and backend are on the same local machine.
    if (isDesktopMode()) {
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
    
    // Desktop app (Tauri): file:// protocol (Windows installer)
    if (origin.startsWith("file://")) {
      return callback(null, true);
    }
    
    // Vercel domains: allow all *.vercel.app subdomains
    const url = new URL(origin);
    if (url.hostname.endsWith(".vercel.app")) {
      return callback(null, true);
    }

    // Orbstack domains: allow all *.orb.local (Docker dev containers)
    if (url.hostname.endsWith(".orb.local")) {
      return callback(null, true);
    }

    // Custom domains: check CORS_ORIGINS env var
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    if (process.env.NODE_ENV === "production") {
      console.warn(`[cors] Rejected origin: ${origin}`);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

const publicMcpRouter = createPublicMcpRouter();
if (publicMcpRouter) app.use(publicMcpRouter);

// Global rate limiter — 200 req/min per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api", globalLimiter);

// Feedback is public, so keep Telegram relay abuse below the global API limit.
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many feedback submissions, please try again later" },
});
app.use("/api/feedback", feedbackLimiter);

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

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
  // Skip camelToSnake for new routes: accounts & catalogs use camelCase natively
  if (_req.path.startsWith('/api/accounts') || _req.path.startsWith('/api/catalogs') || _req.path.startsWith('/api/storage')) {
    return next();
  }
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
  const mem = process.memoryUsage();
  const usedMb = mem.rss / 1024 / 1024;
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    memoryMB: Math.round(usedMb * 10) / 10
  });
});

// Lightweight readiness endpoint to verify server is up for desktop/dev CI
app.get("/api/ready", (_req, res) => {
  res.json({ ready: true, timestamp: new Date().toISOString() });
});

// Update-check diagnostic log endpoint — frontend posts structured events
// so failures can be diagnosed from the server log.
app.post("/api/log/update", (req, res) => {
  const { level, message, extra, timestamp } = req.body || {};
  console.log(`[update:${level || 'info'}] ${message || '?'} ${extra || ''} (${timestamp || '?'})`);
  res.json({ ok: true });
});

// Version check endpoint — CLI checks npm registry, all others check GitHub releases.

// Runtime version — passed by CLI/Docker via APP_VERSION env var.
// Falls back to build-time value when not set (web deployments).
let versionCache: { version: string; fetchedAt: number; source: string } | null = null;
const VERSION_CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.get("/api/version/current", (_req, res) => {
  const current = process.env.APP_VERSION || "0.0.0";
  res.json({ current });
});

app.get("/api/version/latest", async (_req, res) => {
  const installMode = process.env.ERD_INSTALL_MODE || "web";
  const isCli = installMode === "cli";

  try {
    // Return cached value if fresh
    if (versionCache && Date.now() - versionCache.fetchedAt < VERSION_CACHE_TTL) {
      res.json({
        latest: versionCache.version,
        source: versionCache.source,
        cachedAt: new Date(versionCache.fetchedAt).toISOString(),
      });
      return;
    }

    // CLI: fetch from npm registry. Non-CLI: fetch from GitHub releases.
    if (isCli) {
      const resp = await fetch("https://registry.npmjs.org/erdbpro/latest");
      if (!resp.ok) {
        res.json({ latest: null, source: "npm", error: `NPM registry returned ${resp.status}` });
        return;
      }
      const json = await resp.json() as any;
      const version = json?.version || "";
      if (!version) {
        res.json({ latest: null, source: "npm", error: "No version in NPM response" });
        return;
      }

      versionCache = { version, fetchedAt: Date.now(), source: "npm" };
      res.json({ latest: version, source: "npm", cachedAt: new Date().toISOString() });
    } else {
      // GitHub — existing logic
      const response = await fetch(
        "https://api.github.com/repos/hadziqmtqn/erd-builder-pro/releases/latest",
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "erd-builder-pro" } }
      );

      if (!response.ok) {
        res.json({ latest: null, source: "github", error: `GitHub API returned ${response.status}` });
        return;
      }

      const data = await response.json() as any;
      const tag = data?.tag_name || "";
      // Strip leading 'v' if present
      const version = tag.startsWith("v") ? tag.slice(1) : tag;

      versionCache = { version, fetchedAt: Date.now(), source: "github" };
      res.json({ latest: version, source: "github", cachedAt: new Date().toISOString() });
    }
  } catch (err: any) {
    // Return cached value even if expired, as fallback
    if (versionCache) {
      res.json({
        latest: versionCache.version,
        source: "cache-fallback",
        cachedAt: new Date(versionCache.fetchedAt).toISOString(),
      });
      return;
    }
    res.json({ latest: null, source: "error", error: err?.message || "Unknown error" });
  }
});

app.use("/api", authRouter);
app.use("/api", oauthConsentRouter);
app.use("/api/diagrams", diagramsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/search", searchRouter);
app.use("/api/notes", notesRouter);
app.use("/api/drawings", drawingsRouter);
app.use("/api/flowcharts", flowchartsRouter);
app.use("/api/backups", backupsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/ai/settings", aiSettingsRouter);
app.use("/api/ai/chat", aiChatRouter);
app.use("/api/ai/rules", (await import("./routes/ai-rules/index.js")).default);
app.use("/api", feedbackRouter);
app.use("/api", commonRouter);
app.use("/api/guest", guestImportRouter);
app.use("/api/desktop", desktopImportRouter);
app.use("/api", connectionsRouter);
app.use("/api/storage", storageRouter);
app.use("/api/entity-changes", entityChangesRouter);

// ── Auto-backup scheduler (desktop mode) ──
initAutoBackupScheduler().catch((err) => {
  console.error("Failed to init auto-backup scheduler:", err);
});

app.use("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

export default app;
