import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import fs from "node:fs";
import { getConnector } from "../../lib/db-connectors/registry.js";
import { buildConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import { quoteIdentifier } from "./record-helpers.js";
import { buildCreateTableSql, buildIndexStatements, buildStructureStatements, removedEnumValues } from "./structure-helpers.js";

export function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "", quote = "", lineComment = false, blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i], next = sql[i + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; current += ch; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; current += "*/"; i += 1; } else current += ch; continue; }
    if (!quote && ch === "-" && next === "-") { lineComment = true; current += "--"; i += 1; continue; }
    if (!quote && ch === "/" && next === "*") { blockComment = true; current += "/*"; i += 1; continue; }
    if (quote) {
      current += ch;
      if (ch === quote && next === quote) { current += next; i += 1; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; current += ch; continue; }
    if (ch === ";") { if (current.trim()) statements.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const stripLeadingSqlComments = (statement: string) => {
  let text = statement.trim();
  while (true) {
    const next = text
      .replace(/^--[^\n]*(?:\n|$)/, "")
      .replace(/^\/\*[\s\S]*?\*\//, "")
      .trim();
    if (next === text) return text;
    text = next;
  }
};

export function validateImportSql(type: string, sql: string) {
  if (!sql.trim()) throw new Error("SQL file is empty");
  if (sql.length > 2_000_000) throw new Error("SQL file is too large");
  const statements = splitSqlStatements(sql).map(stripLeadingSqlComments).filter(Boolean);
  if (statements.length === 0) throw new Error("No SQL statements found");
  const allowed = /^(create\s+(table|index|unique\s+index)|alter\s+table|drop\s+table|drop\s+index|truncate\s+table|insert\s+into|set\s+foreign_key_checks|pragma\s+foreign_keys|begin|commit|rollback)\b/i;
  for (const statement of statements) {
    if (!allowed.test(statement)) throw new Error("Only table import SQL is supported");
  }
  const text = sql.toLowerCase();
  if (type === "postgresql" && /`|auto_increment|engine\s*=|unsigned\b|pragma\s+/i.test(sql)) throw new Error("SQL file looks like MySQL/SQLite, not PostgreSQL");
  if (type === "mysql" && /\bserial\b|::|create\s+extension|pragma\s+/i.test(sql)) throw new Error("SQL file looks like PostgreSQL/SQLite, not MySQL");
  if (type === "sqlite" && /engine\s*=|auto_increment|create\s+extension|\bserial\b|set\s+foreign_key_checks/i.test(sql)) throw new Error("SQL file looks incompatible with SQLite");
  if (/\b(create\s+function|create\s+procedure|grant|revoke|copy\s+|attach\s+database|load_file|into\s+outfile)\b/i.test(text)) throw new Error("Unsupported SQL statement in import file");
  return statements.filter(statement => !/^(begin|commit|rollback)\b/i.test(statement));
}

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
  const { table, createTable, deleteTables, truncateTables, cloneTable } = req.body;
  const tableAction = Array.isArray(deleteTables) || Array.isArray(truncateTables) || cloneTable;

  if (!table?.trim() && !createTable && !tableAction) return res.status(400).json({ error: "table name is required" });

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
      const tableSchema = createTable || tableAction ? {} : schema.find((item: any) => item.table_name === table);
      if (!createTable && !tableAction && !tableSchema) return res.status(400).json({ error: "Invalid table name" });
      if (createTable && schema.some((item: any) => item.table_name === createTable.name)) {
        return res.status(409).json({ error: "Table already exists" });
      }
      if (!createTable && !tableAction) await assertRemovedEnumValuesUnused(info.type, client, tableSchema, req.body);

      const statements = [
        ...buildStructureStatements(info.type, tableSchema, req.body, schema),
        ...(createTable || tableAction ? [] : buildIndexStatements(info.type, tableSchema, req.body)),
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

export async function importStructureSql(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
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
    const statements = validateImportSql(info.type, String(req.body.sql || ""));
    const connector = getConnector(info.type);
    const { client, release } = await connector.connect(info);
    try {
      if (info.type === "postgresql") {
        await (client as any).query("BEGIN");
        try {
          for (const sql of statements) await (client as any).query(sql);
          await (client as any).query("COMMIT");
        } catch (err) {
          await (client as any).query("ROLLBACK");
          throw err;
        }
      } else if (info.type === "mysql") {
        for (const sql of statements) await (client as any).execute(sql);
      } else {
        for (const sql of statements) (client as any).run(sql);
        fs.writeFileSync(info.database, Buffer.from((client as any).export()));
      }
      res.json({ success: true, statements: statements.length });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error importing SQL:", err);
    res.status(400).json({ error: err.message || "Failed to import SQL" });
  }
}
