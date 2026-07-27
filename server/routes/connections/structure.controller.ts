import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { getConnector } from "../../lib/db-connectors/registry.js";
import { buildConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import { quoteIdentifier } from "./record-helpers.js";
import { buildCreateTableSql, buildIndexStatements, buildStructureStatements, removedEnumValues } from "./structure-helpers.js";

function tableSql(type: string, tableSchema: any) {
  return type === "postgresql" && tableSchema.table_schema
    ? `${quoteIdentifier(type, tableSchema.table_schema)}.${quoteIdentifier(type, tableSchema.table_name)}`
    : quoteIdentifier(type, tableSchema.table_name);
}

async function assertRemovedEnumValuesUnused(type: string, client: any, tableSchema: any, patch: any) {
  if (!patch.columnName || !patch.column || patch.columnName === "__new__") return;
  const currentColumn = (tableSchema.columns || []).find((column: any) => column.name === patch.columnName);
  const removed = removedEnumValues(currentColumn, patch.column.enum_values);
  if (removed.length === 0) return;
  if (type !== "postgresql" && type !== "mysql") return;

  const columnSql = quoteIdentifier(type, patch.columnName);
  if (type === "postgresql") {
    const result = await client.query(`SELECT COUNT(*)::int AS total FROM ${tableSql(type, tableSchema)} WHERE ${columnSql}::text = ANY($1::text[])`, [removed]);
    if (Number(result.rows[0]?.total || 0) > 0) throw new Error(`Enum value "${removed.join(", ")}" is used by records and cannot be removed`);
    throw new Error("Removing PostgreSQL enum values is not supported");
  }

  const isSet = String(currentColumn?.type || currentColumn?.full_type || "").toLowerCase() === "set";
  const where = isSet
    ? removed.map(() => `FIND_IN_SET(?, ${columnSql}) > 0`).join(" OR ")
    : `${columnSql} IN (${removed.map(() => "?").join(", ")})`;
  const [rows] = await client.execute(`SELECT COUNT(*) AS total FROM ${tableSql(type, tableSchema)} WHERE ${where}`, removed);
  if (Number(rows?.[0]?.total || 0) > 0) throw new Error(`Enum value "${removed.join(", ")}" is used by records and cannot be removed`);
}

export async function updateStructure(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, createTable } = req.body;

  if (!table?.trim() && !createTable) return res.status(400).json({ error: "table name is required" });

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
      const tableSchema = createTable ? {} : schema.find((item: any) => item.table_name === table);
      if (!createTable && !tableSchema) return res.status(400).json({ error: "Invalid table name" });
      if (createTable && schema.some((item: any) => item.table_name === createTable.name)) {
        return res.status(409).json({ error: "Table already exists" });
      }
      if (!createTable) await assertRemovedEnumValuesUnused(info.type, client, tableSchema, req.body);

      const statements = [
        ...buildStructureStatements(info.type, tableSchema, req.body, schema),
        ...(createTable ? [] : buildIndexStatements(info.type, tableSchema, req.body)),
      ];
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

export async function getStructureSql(req: ExpressRequest, res: ExpressResponse) {
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

      if (info.type === "mysql") {
        const [rows] = await (client as any).execute(`SHOW CREATE TABLE \`${String(table).replace(/`/g, "``")}\``);
        return res.json({ sql: rows?.[0]?.["Create Table"] || buildCreateTableSql(info.type, tableSchema) });
      }

      if (info.type === "sqlite") {
        const rows = (client as any).exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${String(table).replace(/'/g, "''")}'`);
        return res.json({ sql: rows[0]?.values?.[0]?.[0] || buildCreateTableSql(info.type, tableSchema) });
      }

      res.json({ sql: buildCreateTableSql(info.type, tableSchema) });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error fetching structure SQL:", err);
    res.status(500).json({ error: `Failed to fetch structure SQL: ${err.message}` });
  }
}
