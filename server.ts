import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase credentials in .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
const JWT_SECRET = process.env.JWT_SECRET || "erd-builder-secret-key";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());
  app.use(cookieParser());
  app.use("/uploads", express.static(UPLOADS_DIR));

  // Auth Middleware
  const authenticate = (req: Request, res: Response, next: NextFunction) => {
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
  app.get("/api/auth-config", (req, res) => {
    res.json({ adminEmail: ADMIN_EMAIL });
  });

  // API Routes
  app.post("/api/login", (req, res) => {
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

  app.post("/api/logout", (req, res) => {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none"
    });
    res.json({ success: true });
  });

  app.get("/api/me", (req, res) => {
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

  app.get("/api/files", authenticate, async (req, res) => {
    const { data, error } = await supabase
      .from('files')
      .select(`
        *,
        projects!left(*)
      `)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    
    // Filter manual jika project di-soft-delete (Supabase join filter sedikit berbeda)
    const filteredData = data.filter(file => !file.projects || !file.projects.is_deleted);
    res.json(filteredData);
  });

  app.post("/api/files", authenticate, async (req, res) => {
    const { name, project_id } = req.body;
    const { data, error } = await supabase
      .from('files')
      .insert([{ name, project_id: project_id || null }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get("/api/files/:id", authenticate, async (req, res) => {
    const fileId = req.params.id;
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) return res.status(404).json({ error: "File not found" });

    const { data: entities, error: eError } = await supabase
      .from('entities')
      .select('*, columns(*)')
      .eq('file_id', fileId);

    const { data: relationships, error: rError } = await supabase
      .from('relationships')
      .select('*')
      .eq('file_id', fileId);

    res.json({ ...file, entities: entities || [], relationships: relationships || [] });
  });

  app.delete("/api/files/:id", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('files')
      .update({ is_deleted: true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/files/:id/restore", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('files')
      .update({ is_deleted: false })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/files/:id/permanent", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.put("/api/files/:id", authenticate, async (req, res) => {
    const { name } = req.body;
    const { error } = await supabase
      .from('files')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.put("/api/files/:id/project", authenticate, async (req, res) => {
    const { project_id } = req.body;
    const { error } = await supabase
      .from('files')
      .update({ project_id: project_id || null })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Projects API
  app.get("/api/projects", authenticate, async (req, res) => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/projects", authenticate, async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase
      .from('projects')
      .insert([{ name }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.put("/api/projects/:id", authenticate, async (req, res) => {
    const { name } = req.body;
    const { error } = await supabase
      .from('projects')
      .update({ name })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/projects/:id", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('projects')
      .update({ is_deleted: true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/projects/:id/restore", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('projects')
      .update({ is_deleted: false })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/projects/:id/permanent", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Notes API
  app.get("/api/notes", authenticate, async (req, res) => {
    const { data, error } = await supabase
      .from('notes')
      .select('*, projects!left(*)')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    
    const filteredData = data.filter(note => !note.projects || !note.projects.is_deleted);
    res.json(filteredData);
  });

  app.post("/api/notes", authenticate, async (req, res) => {
    const { title, content, project_id } = req.body;
    const { data, error } = await supabase
      .from('notes')
      .insert([{ title, content: content || "", project_id: project_id || null }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get("/api/notes/:id", authenticate, async (req, res) => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ error: "Note not found" });
    res.json(data);
  });

  app.put("/api/notes/:id", authenticate, async (req, res) => {
    const { title, content, project_id } = req.body;
    const { error } = await supabase
      .from('notes')
      .update({ title, content, project_id: project_id || null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/notes/:id", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('notes')
      .update({ is_deleted: true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/notes/:id/restore", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('notes')
      .update({ is_deleted: false })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/notes/:id/permanent", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Trash API
  app.get("/api/trash", authenticate, async (req, res) => {
    const { data: files } = await supabase.from('files').select('*').eq('is_deleted', true);
    const { data: notes } = await supabase.from('notes').select('*').eq('is_deleted', true);
    const { data: drawings } = await supabase.from('drawings').select('*').eq('is_deleted', true);
    const { data: projects } = await supabase.from('projects').select('*').eq('is_deleted', true);
    res.json({ 
      files: files || [], 
      notes: notes || [], 
      drawings: drawings || [], 
      projects: projects || [] 
    });
  });

  // Drawings API
  app.get("/api/drawings", authenticate, async (req, res) => {
    const { data, error } = await supabase
      .from('drawings')
      .select('*, projects!left(*)')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    
    const filteredData = data.filter(d => !d.projects || !d.projects.is_deleted);
    res.json(filteredData);
  });

  app.post("/api/drawings", authenticate, async (req, res) => {
    const { title, data: dData, project_id } = req.body;
    const { data, error } = await supabase
      .from('drawings')
      .insert([{ title, data: dData || "[]", project_id: project_id || null }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get("/api/drawings/:id", authenticate, async (req, res) => {
    const { data, error } = await supabase
      .from('drawings')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ error: "Drawing not found" });
    res.json(data);
  });

  app.put("/api/drawings/:id", authenticate, async (req, res) => {
    const { title, data: dData, project_id } = req.body;
    const { error } = await supabase
      .from('drawings')
      .update({ title, data: dData, project_id: project_id || null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/drawings/:id", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('drawings')
      .update({ is_deleted: true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/drawings/:id/restore", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('drawings')
      .update({ is_deleted: false })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/drawings/:id/permanent", authenticate, async (req, res) => {
    const { error } = await supabase
      .from('drawings')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Image Upload API
  app.post("/api/upload", authenticate, upload.single("image"), (req: any, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  });

  app.post("/api/save/:id", authenticate, async (req, res) => {
    const fileId = req.params.id;
    const { entities, relationships } = req.body;

    try {
      // Clear existing data for this file
      await supabase.from('relationships').delete().eq('file_id', fileId);
      
      const { data: currentEntities } = await supabase.from('entities').select('id').eq('file_id', fileId);
      if (currentEntities && currentEntities.length > 0) {
        await supabase.from('columns').delete().in('entity_id', currentEntities.map(e => e.id));
      }
      
      await supabase.from('entities').delete().eq('file_id', fileId);

      // Insert entities
      if (entities.length > 0) {
        const { error: eError } = await supabase.from('entities').insert(
          entities.map((e: any) => ({
            id: e.id,
            file_id: fileId,
            name: e.name,
            x: parseFloat(e.x),
            y: parseFloat(e.y),
            color: e.color
          }))
        );
        if (eError) throw eError;

        // Insert columns
        const allColumns: any[] = [];
        entities.forEach((entity: any) => {
          if (entity.columns) {
            entity.columns.forEach((col: any) => {
              allColumns.push({
                id: col.id,
                entity_id: entity.id,
                name: col.name,
                type: col.type,
                is_pk: col.is_pk ? true : false,
                is_nullable: col.is_nullable ? true : false,
                enum_values: col.enum_values || null
              });
            });
          }
        });

        if (allColumns.length > 0) {
          const { error: cError } = await supabase.from('columns').insert(allColumns);
          if (cError) throw cError;
        }
      }

      // Insert relationships
      if (relationships.length > 0) {
        const { error: rError } = await supabase.from('relationships').insert(
          relationships.map((rel: any) => ({
            id: rel.id,
            file_id: fileId,
            source_entity_id: rel.source_entity_id,
            target_entity_id: rel.target_entity_id,
            type: rel.type,
            label: rel.label
          }))
        );
        if (rError) throw rError;
      }

      await supabase.from('files').update({ updated_at: new Date().toISOString() }).eq('id', fileId);
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Save Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
