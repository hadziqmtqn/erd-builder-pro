import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("erd.db");
const JWT_SECRET = process.env.JWT_SECRET || "erd-builder-secret-key";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());
  app.use(cookieParser());

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
    const files = db.prepare("SELECT * FROM files ORDER BY updated_at DESC").all();
    res.json(files);
  });

  app.post("/api/files", authenticate, (req, res) => {
    const { name } = req.body;
    const result = db.prepare("INSERT INTO files (name) VALUES (?)").run(name);
    res.json({ id: result.lastInsertRowid, name });
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
    db.prepare("DELETE FROM files WHERE id = ?").run(req.params.id);
    res.json({ success: true });
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
