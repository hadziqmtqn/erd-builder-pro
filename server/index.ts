import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { checkSupabase } from "./lib/middleware.js";
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

const app = express();

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

// CORS — restrict to specific origins in production
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(cors({
  origin: process.env.NODE_ENV === "production" ? allowedOrigins : true,
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
app.use("/api", feedbackRouter);
app.use("/api", commonRouter);

app.use("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

export default app;
