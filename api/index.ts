import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Cloudflare R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// Initialize S3 client for Cloudflare R2
let s3Client: S3Client | null = null;
if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// Initialize Supabase only if credentials are provided
let supabase: any = null;
try {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

const upload = multer({ storage: multer.memoryStorage() });
const JWT_SECRET = process.env.JWT_SECRET || "erd-builder-secret-key";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Helper to check Supabase health
const checkSupabase = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
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

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Auth Middleware
const authenticate = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
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

// Auth Config (Public)
app.get("/api/auth-config", (req: ExpressRequest, res: ExpressResponse) => {
  res.json({ adminEmail: ADMIN_EMAIL });
});

// API Routes
app.post("/api/login", (req: ExpressRequest, res: ExpressResponse) => {
  const email = req.body.email?.trim();
  const password = req.body.password;
  
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000
    });
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/logout", (req: ExpressRequest, res: ExpressResponse) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  });
  res.json({ success: true });
});

app.get("/api/me", (req: ExpressRequest, res: ExpressResponse) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Apply Supabase health check to all data routes
app.use("/api/*", (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  // Skip auth-config and auth routes
  if (["/api/auth-config", "/api/login", "/api/logout", "/api/me"].includes(req.baseUrl + req.path)) {
    return next();
  }
  checkSupabase(req, res, next);
});

app.get("/api/files", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("files")
    .select("*, projects!left(*)")
    .eq("is_deleted", false)
    .not("projects.is_deleted", "is", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Supabase error fetching files:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.post("/api/files", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name, project_id } = req.body;
  const { data, error } = await supabase
    .from("files")
    .insert([{ name, project_id: project_id || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/files/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const fileId = req.params.id;
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) return res.status(404).json({ error: "File not found" });

  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("*")
    .eq("file_id", fileId);

  if (entitiesError) return res.status(500).json({ error: entitiesError.message });

  const { data: relationships, error: relError } = await supabase
    .from("relationships")
    .select("*")
    .eq("file_id", fileId);

  if (relError) return res.status(500).json({ error: relError.message });

  const entitiesWithColumns = await Promise.all(entities.map(async (entity) => {
    const { data: columns } = await supabase
      .from("columns")
      .select("*")
      .eq("entity_id", entity.id);
    return { ...entity, columns: columns || [] };
  }));

  res.json({ ...file, entities: entitiesWithColumns, relationships });
});

app.delete("/api/files/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("files")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post("/api/files/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("files")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/files/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("files")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.put("/api/files/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("files")
    .update({ name })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.put("/api/files/:id/project", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { project_id } = req.body;
  const { error } = await supabase
    .from("files")
    .update({ project_id: project_id || null })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Projects API
app.get("/api/projects", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("is_deleted", false)
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/projects", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from("projects")
    .insert([{ name }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/projects/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/projects/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("projects")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post("/api/projects/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("projects")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/projects/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  
  try {
    // Get file IDs first
    const { data: files } = await supabase.from("files").select("id").eq("project_id", projectId);
    const fileIds = files?.map(f => f.id) || [];

    if (fileIds.length > 0) {
      await supabase.from("relationships").delete().in("file_id", fileIds);
      const { data: entities } = await supabase.from("entities").select("id").in("file_id", fileIds);
      const entityIds = entities?.map(e => e.id) || [];
      if (entityIds.length > 0) {
        await supabase.from("columns").delete().in("entity_id", entityIds);
      }
      await supabase.from("entities").delete().in("file_id", fileIds);
      await supabase.from("files").delete().in("id", fileIds);
    }
    
    await supabase.from("notes").delete().eq("project_id", projectId);
    await supabase.from("drawings").delete().eq("project_id", projectId);
    await supabase.from("projects").delete().eq("id", projectId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Notes API
app.get("/api/notes", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("notes")
    .select("*, projects!left(*)")
    .eq("is_deleted", false)
    .not("projects.is_deleted", "is", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Supabase error fetching notes:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.post("/api/notes", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, content, project_id } = req.body;
  const { data, error } = await supabase
    .from("notes")
    .insert([{ title, content: content || "", project_id: project_id || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/api/notes/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Note not found" });
  res.json(data);
});

app.put("/api/notes/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, content, project_id } = req.body;
  const { error } = await supabase
    .from("notes")
    .update({ title, content, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/notes/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("notes")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post("/api/notes/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("notes")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/notes/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Trash API
app.get("/api/trash", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data: files } = await supabase.from("files").select("*").eq("is_deleted", true);
  const { data: notes } = await supabase.from("notes").select("*").eq("is_deleted", true);
  const { data: drawings } = await supabase.from("drawings").select("*").eq("is_deleted", true);
  const { data: projects } = await supabase.from("projects").select("*").eq("is_deleted", true);
  res.json({ files: files || [], notes: notes || [], drawings: drawings || [], projects: projects || [] });
});

// Drawings API
app.get("/api/drawings", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("*, projects!left(*)")
    .eq("is_deleted", false)
    .not("projects.is_deleted", "is", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Supabase error fetching drawings:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.post("/api/drawings", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { data: inserted, error } = await supabase
    .from("drawings")
    .insert([{ title, data: data || "[]", project_id: project_id || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(inserted);
});

app.get("/api/drawings/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Drawing not found" });
  res.json(data);
});

app.put("/api/drawings/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { error } = await supabase
    .from("drawings")
    .update({ title, data, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/drawings/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post("/api/drawings/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/api/drawings/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Image Upload API (Cloudflare R2)
app.post("/api/upload", authenticate, upload.single("image"), async (req: any, res: ExpressResponse) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  if (!s3Client || !R2_BUCKET_NAME) {
    return res.status(500).json({ 
      error: "Cloudflare R2 is not configured. Please check your environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)." 
    });
  }

  try {
    const file = req.file;
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    // Construct the public URL
    // If R2_PUBLIC_URL is provided, use it. Otherwise, use the R2 endpoint (which might not be public)
    const publicUrl = R2_PUBLIC_URL 
      ? `${R2_PUBLIC_URL.replace(/\/$/, "")}/${fileName}`
      : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${fileName}`;

    res.json({ url: publicUrl });
  } catch (err: any) {
    console.error("Cloudflare R2 upload error:", err);
    res.status(500).json({ error: `Cloudflare R2 storage error: ${err.message}` });
  }
});

app.post("/api/save/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const fileId = req.params.id;
  const { entities, relationships } = req.body;

  try {
    // Clear existing data for this file
    await supabase.from("relationships").delete().eq("file_id", fileId);
    
    const { data: existingEntities } = await supabase.from("entities").select("id").eq("file_id", fileId);
    const existingEntityIds = existingEntities?.map(e => e.id) || [];
    if (existingEntityIds.length > 0) {
      await supabase.from("columns").delete().in("entity_id", existingEntityIds);
    }
    await supabase.from("entities").delete().eq("file_id", fileId);

    // Insert entities
    if (entities.length > 0) {
      const entitiesToInsert = entities.map((e: any) => ({
        id: e.id,
        file_id: fileId,
        name: e.name,
        x: e.x,
        y: e.y,
        color: e.color || '#6366f1'
      }));
      await supabase.from("entities").insert(entitiesToInsert);

      // Insert columns
      const allColumns: any[] = [];
      for (const entity of entities) {
        for (const col of entity.columns) {
          allColumns.push({
            id: col.id,
            entity_id: entity.id,
            name: col.name,
            type: col.type,
            is_pk: col.is_pk || false,
            is_nullable: col.is_nullable !== undefined ? col.is_nullable : true,
            enum_values: col.enum_values || null
          });
        }
      }
      if (allColumns.length > 0) {
        await supabase.from("columns").insert(allColumns);
      }
    }

    // Insert relationships
    if (relationships.length > 0) {
      const relsToInsert = relationships.map((r: any) => ({
        id: r.id,
        file_id: fileId,
        source_entity_id: r.source_entity_id,
        target_entity_id: r.target_entity_id,
        type: r.type || 'one-to-many',
        label: r.label || null
      }));
      await supabase.from("relationships").insert(relsToInsert);
    }

    await supabase.from("files").update({ updated_at: new Date().toISOString() }).eq("id", fileId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware for development - Only runs locally
// We use a more robust check to ensure this doesn't run on Vercel or in production
const isVercel = !!process.env.VERCEL;
const isProd = process.env.NODE_ENV === "production";

// Serve static assets in production (non-Vercel environments like local start or VPS)
if (!isVercel && isProd) {
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn(`Production build not found at ${distPath}. Did you run 'npm run build'?`);
  }
}

// Development server (Local dev only)
if (!isProd && !isVercel) {
  const setupDev = async () => {
    try {
      const viteModule = "vite";
      const { createServer } = await import(viteModule);
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
  // Production fallback for non-Vercel environments (like local production test)
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Production server running on http://localhost:${PORT}`);
    });
  }
}

export default app;
