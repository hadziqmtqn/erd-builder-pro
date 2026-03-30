import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";

dotenv.config();

const db = new Database("erd.db");
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

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    project_id INTEGER,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    project_id INTEGER,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    file_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    color TEXT DEFAULT '#6366f1',
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_pk BOOLEAN DEFAULT 0,
    is_nullable BOOLEAN DEFAULT 1,
    enum_values TEXT,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    file_id INTEGER NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    type TEXT DEFAULT 'one-to-many',
    label TEXT,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS drawings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    data TEXT,
    project_id INTEGER,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );
`);

// Migration for existing databases
const migrate = () => {
  const filesInfo = db.prepare("PRAGMA table_info(files)").all();
  const filesColumns = filesInfo.map((c: any) => c.name);

  if (!filesColumns.includes("project_id")) {
    try {
      db.exec("ALTER TABLE files ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
      console.log("Added project_id column to files table");
    } catch (e) {
      console.error("Error adding project_id to files:", e);
    }
  }

  if (!filesColumns.includes("is_deleted")) {
    try {
      db.exec("ALTER TABLE files ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
      console.log("Added is_deleted column to files table");
    } catch (e) {
      console.error("Error adding is_deleted to files:", e);
    }
  }

  // Check projects table
  const projectsInfo = db.prepare("PRAGMA table_info(projects)").all();
  const projectsColumns = projectsInfo.map((c: any) => c.name);
  if (!projectsColumns.includes("is_deleted")) {
    try {
      db.exec("ALTER TABLE projects ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
      console.log("Added is_deleted column to projects table");
    } catch (e) {
      console.error("Error adding is_deleted to projects:", e);
    }
  }

  // Check notes table as well
  const notesInfo = db.prepare("PRAGMA table_info(notes)").all();
  if (notesInfo.length > 0) {
    const notesColumns = notesInfo.map((c: any) => c.name);
    if (!notesColumns.includes("project_id")) {
      try {
        db.exec("ALTER TABLE notes ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
      } catch (e) {}
    }
    if (!notesColumns.includes("is_deleted")) {
      try {
        db.exec("ALTER TABLE notes ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
      } catch (e) {}
    }
  }

  // Check drawings table
  const drawingsInfo = db.prepare("PRAGMA table_info(drawings)").all();
  if (drawingsInfo.length > 0) {
    const drawingsColumns = drawingsInfo.map((c: any) => c.name);
    if (!drawingsColumns.includes("project_id")) {
      try {
        db.exec("ALTER TABLE drawings ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
      } catch (e) {}
    }
    if (!drawingsColumns.includes("is_deleted")) {
      try {
        db.exec("ALTER TABLE drawings ADD COLUMN is_deleted BOOLEAN DEFAULT 0");
      } catch (e) {}
    }
  }
};

migrate();

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
    
    console.log(`Login attempt for: "${email}"`);
    console.log(`Expected email: "${ADMIN_EMAIL}"`);
    
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "24h" });
      res.cookie("token", token, {
        httpOnly: true,
        secure: true, // Required for SameSite=None
        sameSite: "none", // Required for cross-origin iframe
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      console.log("Login successful");
      return res.json({ success: true });
    }
    
    console.log("Login failed: Invalid credentials");
    console.log(`Password match: ${password === ADMIN_PASSWORD}`);
    
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
      console.log("Check auth: No token found");
      return res.status(401).json({ error: "Not logged in" });
    }
    try {
      jwt.verify(token, JWT_SECRET);
      console.log("Check auth: Valid token");
      res.json({ authenticated: true });
    } catch (err) {
      console.log("Check auth: Invalid token");
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.get("/api/files", authenticate, (req, res) => {
    const files = db.prepare(`
      SELECT f.* FROM files f 
      LEFT JOIN projects p ON f.project_id = p.id 
      WHERE f.is_deleted = 0 AND (f.project_id IS NULL OR p.is_deleted = 0)
      ORDER BY f.updated_at DESC
    `).all();
    res.json(files);
  });

  app.post("/api/files", authenticate, (req, res) => {
    const { name, project_id } = req.body;
    const result = db.prepare("INSERT INTO files (name, project_id) VALUES (?, ?)").run(name, project_id || null);
    res.json({ id: result.lastInsertRowid, name, project_id });
  });

  app.get("/api/files/:id", authenticate, (req, res) => {
    const fileId = req.params.id;
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(fileId);
    if (!file) return res.status(404).json({ error: "File not found" });

    const entities = db.prepare("SELECT * FROM entities WHERE file_id = ?").all(fileId);
    const relationships = db.prepare("SELECT * FROM relationships WHERE file_id = ?").all(fileId);
    
    const entitiesWithColumns = entities.map(entity => {
      const columns = db.prepare("SELECT * FROM columns WHERE entity_id = ?").all(entity.id);
      return { ...entity, columns };
    });

    res.json({ ...file, entities: entitiesWithColumns, relationships });
  });

  app.delete("/api/files/:id", authenticate, (req, res) => {
    // Soft delete
    db.prepare("UPDATE files SET is_deleted = 1 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/files/:id/restore", authenticate, (req, res) => {
    db.prepare("UPDATE files SET is_deleted = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/files/:id/permanent", authenticate, (req, res) => {
    db.prepare("DELETE FROM files WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.put("/api/files/:id/project", authenticate, (req, res) => {
    const { project_id } = req.body;
    db.prepare("UPDATE files SET project_id = ? WHERE id = ?").run(project_id || null, req.params.id);
    res.json({ success: true });
  });

  // Projects API
  app.get("/api/projects", authenticate, (req, res) => {
    const projects = db.prepare("SELECT * FROM projects WHERE is_deleted = 0 ORDER BY name ASC").all();
    res.json(projects);
  });

  app.post("/api/projects", authenticate, (req, res) => {
    const { name } = req.body;
    const result = db.prepare("INSERT INTO projects (name) VALUES (?)").run(name);
    res.json({ id: result.lastInsertRowid, name });
  });

  app.delete("/api/projects/:id", authenticate, (req, res) => {
    db.prepare("UPDATE projects SET is_deleted = 1 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/projects/:id/restore", authenticate, (req, res) => {
    db.prepare("UPDATE projects SET is_deleted = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/projects/:id/permanent", authenticate, (req, res) => {
    db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Notes API
  app.get("/api/notes", authenticate, (req, res) => {
    const notes = db.prepare(`
      SELECT n.* FROM notes n
      LEFT JOIN projects p ON n.project_id = p.id
      WHERE n.is_deleted = 0 AND (n.project_id IS NULL OR p.is_deleted = 0)
      ORDER BY n.updated_at DESC
    `).all();
    res.json(notes);
  });

  app.post("/api/notes", authenticate, (req, res) => {
    const { title, content, project_id } = req.body;
    const result = db.prepare("INSERT INTO notes (title, content, project_id) VALUES (?, ?, ?)")
      .run(title, content || "", project_id || null);
    res.json({ id: result.lastInsertRowid, title, content, project_id });
  });

  app.get("/api/notes/:id", authenticate, (req, res) => {
    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json(note);
  });

  app.put("/api/notes/:id", authenticate, (req, res) => {
    const { title, content, project_id } = req.body;
    db.prepare("UPDATE notes SET title = ?, content = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(title, content, project_id || null, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/notes/:id", authenticate, (req, res) => {
    db.prepare("UPDATE notes SET is_deleted = 1 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/notes/:id/restore", authenticate, (req, res) => {
    db.prepare("UPDATE notes SET is_deleted = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/notes/:id/permanent", authenticate, (req, res) => {
    db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Trash API
  app.get("/api/trash", authenticate, (req, res) => {
    const files = db.prepare("SELECT * FROM files WHERE is_deleted = 1").all();
    const notes = db.prepare("SELECT * FROM notes WHERE is_deleted = 1").all();
    const drawings = db.prepare("SELECT * FROM drawings WHERE is_deleted = 1").all();
    const projects = db.prepare("SELECT * FROM projects WHERE is_deleted = 1").all();
    res.json({ files, notes, drawings, projects });
  });

  // Drawings API
  app.get("/api/drawings", authenticate, (req, res) => {
    const drawings = db.prepare(`
      SELECT d.* FROM drawings d
      LEFT JOIN projects p ON d.project_id = p.id
      WHERE d.is_deleted = 0 AND (d.project_id IS NULL OR p.is_deleted = 0)
      ORDER BY d.updated_at DESC
    `).all();
    res.json(drawings);
  });

  app.post("/api/drawings", authenticate, (req, res) => {
    const { title, data, project_id } = req.body;
    const result = db.prepare("INSERT INTO drawings (title, data, project_id) VALUES (?, ?, ?)")
      .run(title, data || "[]", project_id || null);
    res.json({ id: result.lastInsertRowid, title, data, project_id });
  });

  app.get("/api/drawings/:id", authenticate, (req, res) => {
    const drawing = db.prepare("SELECT * FROM drawings WHERE id = ?").get(req.params.id);
    if (!drawing) return res.status(404).json({ error: "Drawing not found" });
    res.json(drawing);
  });

  app.put("/api/drawings/:id", authenticate, (req, res) => {
    const { title, data, project_id } = req.body;
    db.prepare("UPDATE drawings SET title = ?, data = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(title, data, project_id || null, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/drawings/:id", authenticate, (req, res) => {
    db.prepare("UPDATE drawings SET is_deleted = 1 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/drawings/:id/restore", authenticate, (req, res) => {
    db.prepare("UPDATE drawings SET is_deleted = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/drawings/:id/permanent", authenticate, (req, res) => {
    db.prepare("DELETE FROM drawings WHERE id = ?").run(req.params.id);
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

  app.post("/api/save/:id", authenticate, (req, res) => {
    const fileId = req.params.id;
    const { entities, relationships } = req.body;

    const transaction = db.transaction(() => {
      // Clear existing data for this file
      db.prepare("DELETE FROM relationships WHERE file_id = ?").run(fileId);
      db.prepare("DELETE FROM columns WHERE entity_id IN (SELECT id FROM entities WHERE file_id = ?)").run(fileId);
      db.prepare("DELETE FROM entities WHERE file_id = ?").run(fileId);

      // Insert entities and columns
      for (const entity of entities) {
        db.prepare("INSERT INTO entities (id, file_id, name, x, y, color) VALUES (?, ?, ?, ?, ?, ?)")
          .run(entity.id, fileId, entity.name, entity.x, entity.y, entity.color);
        
        for (const col of entity.columns) {
          db.prepare("INSERT INTO columns (id, entity_id, name, type, is_pk, is_nullable, enum_values) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(col.id, entity.id, col.name, col.type, col.is_pk ? 1 : 0, col.is_nullable ? 1 : 0, col.enum_values || null);
        }
      }

      // Insert relationships
      for (const rel of relationships) {
        db.prepare("INSERT INTO relationships (id, file_id, source_entity_id, target_entity_id, type, label) VALUES (?, ?, ?, ?, ?, ?)")
          .run(rel.id, fileId, rel.source_entity_id, rel.target_entity_id, rel.type, rel.label);
      }

      db.prepare("UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(fileId);
    });

    transaction();
    res.json({ success: true });
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
