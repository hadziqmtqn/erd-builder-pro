import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { isDesktopMode } from "../lib/config.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import type { ConnectionInfo, DbType } from "../lib/db-connectors/types.js";
import { testConnection, fetchSchema } from "../lib/db-connectors/registry.js";

const router = Router();

// ── Desktop-only guard ──
function desktopOnly(_req: ExpressRequest, res: ExpressResponse, next: Function) {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }
  next();
}

function buildConnectionInfo(conn: any): ConnectionInfo {
  return {
    type: conn.type as DbType,
    host: conn.host || undefined,
    port: conn.port || undefined,
    user: conn.user || undefined,
    password: conn.password ? decrypt(conn.password) : undefined,
    database: conn.database,
  };
}

// GET /api/connections — list all saved connections
router.get("/connections", authenticate, desktopOnly, async (_req: ExpressRequest, res: ExpressResponse) => {
  const userId = (_req as any).user.id;
  try {
    const connections = await prisma?.localDbConnection.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    const masked = (connections || []).map((c: any) => ({
      ...c,
      password: c.password ? "***" : null,
    }));

    res.json(masked);
  } catch (err) {
    console.error("Error listing connections:", err);
    res.status(500).json({ error: "Failed to list connections" });
  }
});

// POST /api/connections — create connection
router.post("/connections", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { name, type, host, port, user, password, database } = req.body;

  if (!name || !type || !database) {
    return res.status(400).json({ error: "name, type, and database are required" });
  }

  try {
    const encryptedPw = password ? encrypt(password) : null;
    const conn = await prisma?.localDbConnection.create({
      data: {
        userId,
        name,
        type,
        host,
        port: port ? Number(port) : null,
        user,
        password: encryptedPw,
        database,
      },
    });
    res.status(201).json(conn);
  } catch (err) {
    console.error("Error creating connection:", err);
    res.status(500).json({ error: "Failed to create connection" });
  }
});

// PUT /api/connections/:id — update connection
router.put("/connections/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, host, port, user, password, database } = req.body;

  try {
    const existing = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = Number(port);
    if (user !== undefined) data.user = user;
    if (database !== undefined) data.database = database;
    if (password !== undefined) {
      data.password = password ? encrypt(password) : null;
    }

    const updated = await prisma?.localDbConnection.update({
      where: { id: Number(id) },
      data,
    });
    res.json(updated);
  } catch (err) {
    console.error("Error updating connection:", err);
    res.status(500).json({ error: "Failed to update connection" });
  }
});

// DELETE /api/connections/:id — delete connection
router.delete("/connections/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const existing = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    await prisma?.localDbConnection.delete({ where: { id: Number(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting connection:", err);
    res.status(500).json({ error: "Failed to delete connection" });
  }
});

// POST /api/connections/test — test connection without saving
router.post("/connections/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const { type, host, port, user, password, database } = req.body;

  if (!type || !database) {
    return res.status(400).json({ error: "type and database are required" });
  }

  try {
    const result = await testConnection({ type, host, port, user, password, database } as ConnectionInfo);
    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/connections/:id/test — test saved connection
router.post("/connections/:id/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const conn = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const result = await testConnection(buildConnectionInfo(conn));
    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/connections/:id/schema — fetch schema from external DB
router.post("/connections/:id/schema", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const conn = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const schema = await fetchSchema(buildConnectionInfo(conn));
    res.json({ schema, connectionName: conn.name, dbType: conn.type });
  } catch (err: any) {
    console.error("Error fetching schema:", err);
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
});

export default router;
