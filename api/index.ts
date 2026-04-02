import express from "express";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "node:fs";

// Import modular routers and libs
import { checkSupabase } from "./lib/middleware";
import authRouter from "./routes/auth";
import filesRouter from "./routes/files";
import projectsRouter from "./routes/projects";
import notesRouter from "./routes/notes";
import drawingsRouter from "./routes/drawings";
import commonRouter from "./routes/common";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Apply Supabase health check to all /api pathways
app.use("/api/*", (req, res, next) => {
  const path = req.originalUrl.split("?")[0];
  if (["/api/auth-config", "/api/login", "/api/logout", "/api/me"].includes(path)) {
    return next();
  }
  checkSupabase(req, res, next);
});

// Modular Routes
app.use("/api", authRouter);
app.use("/api/files", filesRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/drawings", drawingsRouter);
app.use("/api", commonRouter); // trash, upload, test-r2

// Environment checks
const isVercel = !!process.env.VERCEL;
const isProd = process.env.NODE_ENV === "production";

// Serve static assets in production (non-Vercel environments)
if (!isVercel && isProd) {
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

// Development server (Local dev only)
if (!isProd && !isVercel) {
  const setupDev = async () => {
    try {
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Development server running on http://localhost:${PORT}`);
      });
    } catch (e) {
      console.warn("Vite dev server failed to start:", e);
    }
  };
  setupDev();
} else if (!isVercel) {
  // Production fallback for non-Vercel environments
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Production server running on http://localhost:${PORT}`);
    });
  }
}

export default app;
