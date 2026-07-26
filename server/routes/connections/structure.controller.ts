import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { getConnector } from "../../lib/db-connectors/registry.js";
import { buildConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import { buildStructureStatements } from "./structure-helpers.js";

export async function updateStructure(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table } = req.body;

  if (!table?.trim()) return res.status(400).json({ error: "table name is required" });

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const info = buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    });
    const connector = getConnector(info.type);
    const { client, release } = await connector.connect(info);

    try {
      const schema = await connector.fetchSchema(client, info);
      const tableSchema = schema.find((item: any) => item.table_name === table);
      if (!tableSchema) return res.status(400).json({ error: "Invalid table name" });

      const statements = buildStructureStatements(info.type, tableSchema, req.body, schema);
      if (statements.length === 0) return res.json({ success: true });

      if (info.type === "postgresql") {
        await (client as any).query("BEGIN");
        try {
          for (const sql of statements) await (client as any).query(sql);
          await (client as any).query("COMMIT");
        } catch (err) {
          await (client as any).query("ROLLBACK");
          throw err;
        }
      } else {
        for (const sql of statements) await (client as any).execute(sql);
      }

      res.json({ success: true });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error updating structure:", err);
    res.status(500).json({ error: `Failed to update structure: ${err.message}` });
  }
}
