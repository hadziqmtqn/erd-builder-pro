import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { runUserMigration } from "./migration.service.js";

export async function migrateConnections(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;

  try {
    const result = await runUserMigration(userId);
    res.json(result);
  } catch (err: any) {
    console.error("Migration error:", err);
    res.status(500).json({ error: `Migration failed: ${err.message}` });
  }
}
