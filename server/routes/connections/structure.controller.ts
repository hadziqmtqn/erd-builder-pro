import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import fs from "node:fs";
import { fetchSchemaForClient, getConnector, invalidateSchemaCache } from "../../lib/db-connectors/registry.js";
import { buildConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import { quoteIdentifier } from "./record-helpers.js";
import { buildConstraintStatements, buildCreateTableSql, buildIndexStatements, buildStructureStatements, removedEnumValues } from "./structure-helpers.js";

export const MAX_SQL_IMPORT_BYTES = 25 * 1024 * 1024;
const MYSQL_LARGE_VALUE_COLUMN = /((?:`(?:``|[^`])+`|[a-z0-9_$]+)\s+)((?:tiny|medium|long)?(?:text|blob)|json|geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection)\b([^,)]*)/gim;
const MYSQL_DEFAULT_VALUE = /\s+default\s+(?:null|\([^)]*\)|'(?:\\.|''|[^'])*'|"(?:\\.|""|[^"])*"|[^\s,]+)/i;

export function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "", quote = "", lineComment = false, blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i], next = sql[i + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; current += ch; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; current += "*/"; i += 1; } else current += ch; continue; }
    if (!quote && ch === "-" && next === "-") { lineComment = true; current += "--"; i += 1; continue; }
    if (!quote && ch === "#") { lineComment = true; current += ch; continue; }
    if (!quote && ch === "/" && next === "*") { blockComment = true; current += "/*"; i += 1; continue; }
    if (quote) {
      current += ch;
      if (ch === "\\" && next) { current += next; i += 1; continue; }
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
      .replace(/^#[^\n]*(?:\n|$)/, "")
      .replace(/^\/\*[\s\S]*?\*\//, "")
      .trim();
    if (next === text) return text;
    text = next;
  }
};

export function validateImportSql(type: string, sql: string) {
  if (!sql.trim()) throw new Error("SQL file is empty");
  if (Buffer.byteLength(sql, "utf8") > MAX_SQL_IMPORT_BYTES) throw new Error("SQL file is too large. Maximum size is 25 MB");
  const statements = splitSqlStatements(sql).map(stripLeadingSqlComments).filter(Boolean);
  if (statements.length === 0) throw new Error("No SQL statements found");
  const allowed = /^(create\s+(table|index|unique\s+index)|alter\s+table|drop\s+table|drop\s+index|truncate\s+table|insert\s+into|set\s+foreign_key_checks|pragma\s+foreign_keys|begin|commit|rollback)\b/i;
  const mysqlDumpControl = /^(set\s+(?:(?:@@(?:session\.)?(?:sql_log_bin|foreign_key_checks|unique_checks|sql_mode|time_zone|character_set_[a-z_]+|collation_[a-z_]+))|(?:@@global\.gtid_purged)|(?:@[_a-z][\w$]*))(?:\s|=)|set\s+(?:names|sql_mode|time_zone|foreign_key_checks|unique_checks|character_set_[a-z_]+|collation_[a-z_]+|autocommit|sql_notes)\b|lock\s+tables\b|unlock\s+tables\b)/i;
  for (const statement of statements) {
    if (!allowed.test(statement) && !(type === "mysql" && mysqlDumpControl.test(statement))) {
      throw new Error("Only table import SQL is supported");
    }
  }
  const text = sql.toLowerCase();
  if (type === "postgresql" && /`|auto_increment|engine\s*=|unsigned\b|pragma\s+/i.test(sql)) throw new Error("SQL file looks like MySQL/SQLite, not PostgreSQL");
  if (type === "mysql" && /\bserial\b|::|create\s+extension|pragma\s+/i.test(sql)) throw new Error("SQL file looks like PostgreSQL/SQLite, not MySQL");
  if (type === "sqlite" && /engine\s*=|auto_increment|create\s+extension|\bserial\b|set\s+foreign_key_checks/i.test(sql)) throw new Error("SQL file looks incompatible with SQLite");
  if (/\b(create\s+function|create\s+procedure|grant|revoke|copy\s+|attach\s+database|load_file|into\s+outfile)\b/i.test(text)) throw new Error("Unsupported SQL statement in import file");
  return statements
    .filter(statement => !/^(begin|commit|rollback)\b/i.test(statement))
    .filter(statement => !(type === "mysql" && /^(?:set\s+(?:@[_a-z][\w$]*|@@(?:session\.sql_log_bin|global\.gtid_purged)\b)|lock\s+tables\b|unlock\s+tables\b)/i.test(statement)));
}

export function extractMySqlCreatedTables(statements: string[]) {
  const tables: string[] = [];
  const tablePattern = /^create\s+(?:temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:`(?:``|[^`])+`|[a-z0-9_$]+)(?:\s*\.\s*(?:`(?:``|[^`])+`|[a-z0-9_$]+))?)/i;

  for (const statement of statements) {
    const match = statement.match(tablePattern);
    if (!match) continue;
    const token = match[1].split(/\s*\.\s*/).pop()!;
    const name = token.startsWith("`") && token.endsWith("`")
      ? token.slice(1, -1).replace(/``/g, "`")
      : token;
    if (!tables.some(table => table.toLowerCase() === name.toLowerCase())) tables.push(name);
  }

  return tables;
}

export function normalizeMySqlCreateTableDefaults(statement: string) {
  if (!/^create\s+(?:temporary\s+)?table\b/i.test(statement)) return statement;

  return statement.replace(
    MYSQL_LARGE_VALUE_COLUMN,
    (match, column, type, attributes) => `${column}${type}${attributes.replace(MYSQL_DEFAULT_VALUE, "")}`,
  );
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
      const schema = await fetchSchemaForClient(client, info);
      const tableSchema = createTable || tableAction ? {} : schema.find((item: any) => item.table_name === table);
      if (!createTable && !tableAction && !tableSchema) return res.status(400).json({ error: "Invalid table name" });
      if (createTable && schema.some((item: any) => item.table_name === createTable.name)) {
        return res.status(409).json({ error: "Table already exists" });
      }
      if (!createTable && !tableAction) await assertRemovedEnumValuesUnused(info.type, client, tableSchema, req.body);

      const statements = [
        ...buildStructureStatements(info.type, tableSchema, req.body, schema),
        ...(createTable || tableAction ? [] : buildIndexStatements(info.type, tableSchema, req.body)),
        ...(createTable || tableAction ? [] : buildConstraintStatements(info.type, tableSchema, req.body)),
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

      invalidateSchemaCache(info);
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
      const schema = await fetchSchemaForClient(client, info);
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
        const existingTables = new Set(
          (await getConnector(info.type).fetchSchema(client, info)).map((table: any) => String(table.table_name).toLowerCase()),
        );
        const createdTables = extractMySqlCreatedTables(statements);
        const executableStatements = statements.map(normalizeMySqlCreateTableDefaults);
        try {
          await (client as any).execute("SET FOREIGN_KEY_CHECKS=0");
          for (const sql of executableStatements) await (client as any).execute(sql);
        } catch (err) {
          await (client as any).execute("SET FOREIGN_KEY_CHECKS=0");
          for (const table of [...createdTables].reverse()) {
            if (!existingTables.has(table.toLowerCase())) {
              await (client as any).execute(`DROP TABLE IF EXISTS ${quoteIdentifier("mysql", table)}`);
            }
          }
          throw err;
        } finally {
          await (client as any).execute("SET FOREIGN_KEY_CHECKS=1");
        }
      } else {
        for (const sql of statements) (client as any).run(sql);
        fs.writeFileSync(info.database, Buffer.from((client as any).export()));
      }
      invalidateSchemaCache(info);
      res.json({ success: true, statements: statements.length });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error importing SQL:", err);
    res.status(400).json({ error: err.message || "Failed to import SQL" });
  }
}
