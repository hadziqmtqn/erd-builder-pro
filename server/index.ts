import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

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

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use("/api/*", (req, res, next) => {
  const path = req.originalUrl.split("?")[0];
  if (["/api/auth-config", "/api/login", "/api/logout", "/api/me"].includes(path)) {
    return next();
  }
  checkSupabase(req, res, next);
});

app.use("/api", authRouter);
app.use("/api/diagrams", diagramsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/drawings", drawingsRouter);
app.use("/api/flowcharts", flowchartsRouter);
app.use("/api/backups", backupsRouter);
app.use("/api", feedbackRouter);
app.use("/api", commonRouter);

app.use("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
});

export default app;
