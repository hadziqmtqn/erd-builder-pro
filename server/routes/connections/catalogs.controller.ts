import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { fetchSchema, testConnection, getConnector } from "../../lib/db-connectors/registry.js";
import { decrypt } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";
import { resolveOwnedProjectId } from "../../lib/security.js";
import { buildConnectionInfo } from "./middleware.js";
import * as accountsService from "./accounts.service.js";
import * as catalogsService from "./catalogs.service.js";

type RecordFilterInput = {
  enabled?: boolean;
  column?: string;
  operator?: string;
  value?: string;
  value2?: string;
};

type RecordSortInput = {
  column?: string;
  direction?: string;
};

type TableInfo = {
  dataSize: number | null;
  indexSize: number | null;
  totalSize: number | null;
};

function quoteIdentifier(type: string, name: string) {
  return type === "mysql" ? `\`${name.replace(/`/g, "``")}\`` : `"${name.replace(/"/g, '""')}"`;
}

function quoteSqliteValue(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function splitList(value = "") {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function buildRecordOrder(type: string, sort: RecordSortInput | undefined, allowedColumns: Set<string>) {
  if (!sort?.column) return "";
  const direction = String(sort.direction || "").toLowerCase();
  if (!allowedColumns.has(sort.column)) throw new Error(`Invalid sort column: ${sort.column}`);
  if (direction !== "asc" && direction !== "desc") throw new Error("Invalid sort direction");
  return ` ORDER BY ${quoteIdentifier(type, sort.column)} ${direction.toUpperCase()}`;
}

export function buildRecordUpdate(type: string, values: Record<string, any>, key: Record<string, any>, allowedColumns: Set<string>) {
  const params: any[] = [];
  const placeholder = () => type === "postgresql" ? `$${params.length}` : "?";
  const valueRef = (value: any) => {
    params.push(value);
    return placeholder();
  };

  const set = Object.entries(values).map(([column, value]) => {
    if (!allowedColumns.has(column)) throw new Error(`Invalid update column: ${column}`);
    return `${quoteIdentifier(type, column)} = ${valueRef(value)}`;
  });
  const where = Object.entries(key).map(([column, value]) => {
    if (!allowedColumns.has(column)) throw new Error(`Invalid key column: ${column}`);
    return `${quoteIdentifier(type, column)} = ${valueRef(value)}`;
  });

  if (set.length === 0) throw new Error("No update values provided");
  if (where.length === 0) throw new Error("No record key provided");

  return { sql: ` SET ${set.join(", ")} WHERE ${where.join(" AND ")}`, params };
}

export function buildRecordWhere(type: string, filters: RecordFilterInput[] | undefined, allowedColumns: Set<string>) {
  const clauses: string[] = [];
  const params: string[] = [];
  const placeholder = () => type === "postgresql" ? `$${params.length}` : "?";
  const valueRef = (value: string) => {
    params.push(value);
    return type === "sqlite" ? quoteSqliteValue(value) : placeholder();
  };

  for (const filter of filters || []) {
    if (!filter?.enabled) continue;
    const column = String(filter.column || "");
    const operator = String(filter.operator || "").toUpperCase();
    if (!column || !allowedColumns.has(column)) throw new Error(`Invalid filter column: ${column}`);

    const columnSql = quoteIdentifier(type, column);
    const value = String(filter.value ?? "");
    const value2 = String(filter.value2 ?? "");

    if (["=", "!=", "<>", ">", ">=", "<", "<="].includes(operator)) {
      if (!value) continue;
      clauses.push(`${columnSql} ${operator} ${valueRef(value)}`);
    } else if (operator === "LIKE" || operator === "NOT LIKE") {
      if (!value) continue;
      const sqlOperator = type === "postgresql" ? operator.replace("LIKE", "ILIKE") : operator;
      clauses.push(`${columnSql} ${sqlOperator} ${valueRef(value)}`);
    } else if (operator === "CONTAINS" || operator === "NOT CONTAINS") {
      if (!value) continue;
      const sqlOperator = operator === "NOT CONTAINS" ? "NOT LIKE" : "LIKE";
      clauses.push(`${columnSql} ${type === "postgresql" ? sqlOperator.replace("LIKE", "ILIKE") : sqlOperator} ${valueRef(`%${value}%`)}`);
    } else if (operator === "IN" || operator === "NOT IN") {
      const values = splitList(value);
      if (values.length === 0) continue;
      clauses.push(`${columnSql} ${operator} (${values.map(valueRef).join(", ")})`);
    } else if (operator === "BETWEEN" || operator === "NOT BETWEEN") {
      if (!value || !value2) continue;
      clauses.push(`${columnSql} ${operator} ${valueRef(value)} AND ${valueRef(value2)}`);
    } else if (operator === "IS") {
      clauses.push(`${columnSql} IS NULL`);
    } else if (operator === "IS NOT") {
      clauses.push(`${columnSql} IS NOT NULL`);
    } else {
      throw new Error(`Invalid filter operator: ${operator}`);
    }
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

async function fetchTableInfo(type: string, client: any, database: string, tableSchema: any): Promise<TableInfo> {
  if (type === "postgresql") {
    const result = await client.query(
      `SELECT
        pg_relation_size(format('%I.%I', $1, $2)::regclass)::bigint AS data_size,
        pg_indexes_size(format('%I.%I', $1, $2)::regclass)::bigint AS index_size,
        pg_total_relation_size(format('%I.%I', $1, $2)::regclass)::bigint AS total_size`,
      [tableSchema.table_schema || "public", tableSchema.table_name],
    );
    return {
      dataSize: Number(result.rows[0]?.data_size ?? 0),
      indexSize: Number(result.rows[0]?.index_size ?? 0),
      totalSize: Number(result.rows[0]?.total_size ?? 0),
    };
  }

  if (type === "mysql") {
    const [rows] = await client.execute(
      `SELECT DATA_LENGTH AS data_size, INDEX_LENGTH AS index_size, DATA_LENGTH + INDEX_LENGTH AS total_size
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [database, tableSchema.table_name],
    );
    const row = rows[0] || {};
    return {
      dataSize: Number(row.data_size ?? 0),
      indexSize: Number(row.index_size ?? 0),
      totalSize: Number(row.total_size ?? 0),
    };
  }

  return { dataSize: null, indexSize: null, totalSize: null };
}

export async function listCatalogs(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;

  try {
    const catalogs = await catalogsService.findAllCatalogs(userId, accountId);
    res.json(catalogs || []);
  } catch (err) {
    console.error("Error listing catalogs:", err);
    res.status(500).json({ error: "Failed to list catalogs" });
  }
}

export async function createCatalog(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { accountId, databaseName, label } = req.body;

  if (!accountId || !databaseName) {
    return res.status(400).json({ error: "accountId and databaseName are required" });
  }

  try {
    // Verify account belongs to user
    const account = await accountsService.findAccountById(accountId, userId);
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Check duplicate database name under same account
    const existing = await (prisma as any)?.dbCatalog.findFirst({
      where: { accountId: Number(accountId), databaseName },
    });
    if (existing) {
      return res.status(409).json({ error: `Database "${databaseName}" is already connected` });
    }

    const catalog = await catalogsService.createCatalog({
      accountId: Number(accountId),
      databaseName,
      label: label || databaseName,
    });

    res.status(201).json(catalog);
  } catch (err) {
    console.error("Error creating catalog:", err);
    res.status(500).json({ error: "Failed to create catalog" });
  }
}

export async function deleteCatalog(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const affectedDiagrams = await catalogsService.findAffectedDiagrams(id);

    await catalogsService.detachDiagramsFromCatalog(id);
    await catalogsService.deleteCatalog(id);

    res.json({
      success: true,
      detachedDiagrams: affectedDiagrams?.length ?? 0,
      diagramNames: affectedDiagrams?.map((d: any) => d.name) ?? [],
    });
  } catch (err) {
    console.error("Error deleting catalog:", err);
    res.status(500).json({ error: "Failed to delete catalog" });
  }
}

export async function fetchCatalogSchema(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const schema = await fetchSchema(buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    }));

    res.json({
      schema,
      connectionName: (catalog as any).label || (catalog as any).databaseName,
      dbType: (catalog as any).account.type,
    });
  } catch (err: any) {
    console.error("Error fetching schema:", err);
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
}

export async function importSchema(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, project_id } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Diagram name is required" });
  }

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const projectId = await resolveOwnedProjectId(prisma as any, userId, project_id);

    // 1. Fetch schema from the database
    const tables = await fetchSchema(buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    }));

    // 2. Build positions (auto-layout) + data JSON
    const positions: Record<string, any> = {};
    tables.forEach((t: any, i: number) => {
      positions[t.table_name] = {
        x: (i % 4) * 280 + 50,
        y: Math.floor(i / 4) * 200 + 50,
        color: "#4f46e5",
        collapsed: false,
        hidden_columns: [],
        note: "",
      };
    });

    const diagramData = {
      nodes: positions,
      viewport: { x: 0, y: 0, zoom: 1 },
      _type: "production_db_positions",
      source: {
        type: (catalog as any).account.type,
        host: (catalog as any).account.host || undefined,
        port: (catalog as any).account.port || undefined,
        user: (catalog as any).account.user || undefined,
        database: (catalog as any).databaseName,
        password_encrypted: (catalog as any).account.password || undefined,
      },
    };

    // 3. Create diagram
    const diagram = await prisma?.diagram.create({
      data: {
        name: name.trim(),
        uid: crypto.randomUUID(),
        userId,
        projectId,
        sourceType: "production_db",
        sourceConnectionId: Number(id),
        data: JSON.stringify(diagramData),
      },
    });

    if (!diagram) return res.status(500).json({ error: "Failed to create diagram" });

    res.status(201).json({
      diagram,
      tableCount: tables.length,
    });
  } catch (err: any) {
    console.error("Error importing schema:", err);
    res.status(500).json({ error: `Failed to import schema: ${err.message}` });
  }
}

export async function queryRecords(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, page = 1, pageSize = 50, filters, sort } = req.body;

  if (!table?.trim()) {
    return res.status(400).json({ error: "table name is required" });
  }

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
      const limit = Math.min(Math.max(1, pageSize), 200);
      const offset = (Math.max(1, page) - 1) * limit;
      const schema = await connector.fetchSchema(client, info);
      const tableSchema = schema.find((item: any) => item.table_name === table);
      if (!tableSchema) return res.status(400).json({ error: "Invalid table name" });

      const allowedColumns = new Set((tableSchema.columns || []).map((column: any) => column.name));
      let where: ReturnType<typeof buildRecordWhere>;
      let orderSql = "";
      try {
        where = buildRecordWhere(info.type, Array.isArray(filters) ? filters : [], allowedColumns);
        orderSql = buildRecordOrder(info.type, sort, allowedColumns);
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Invalid query options" });
      }

      let columns: string[] = [];
      let rows: Record<string, any>[] = [];
      let total = 0;
      const tableInfo = await fetchTableInfo(info.type, client, info.database, tableSchema);

      if (info.type === "postgresql") {
        const pgClient = client as any;
        const tableSql = quoteIdentifier(info.type, table);
        const countRes = await pgClient.query(`SELECT COUNT(*)::int AS total FROM ${tableSql}${where.sql}`, where.params);
        total = countRes.rows[0]?.total || 0;
        const dataRes = await pgClient.query(`SELECT * FROM ${tableSql}${where.sql}${orderSql} LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`, [...where.params, limit, offset]);
        columns = dataRes.fields.map((f: any) => f.name);
        rows = dataRes.rows;
      } else if (info.type === "mysql") {
        const mysqlClient = client as any;
        const tableSql = quoteIdentifier(info.type, table);
        const [countRows] = await mysqlClient.execute(`SELECT COUNT(*) AS total FROM ${tableSql}${where.sql}`, where.params);
        total = countRows[0]?.total || 0;
        const [dataRows, dataFields] = await mysqlClient.execute(`SELECT * FROM ${tableSql}${where.sql}${orderSql} LIMIT ${limit} OFFSET ${offset}`, where.params);
        columns = (dataFields || []).map((f: any) => f.name || f.column || f);
        rows = dataRows;
      } else if (info.type === "sqlite") {
        const sqdb = client as any;
        const tableSql = quoteIdentifier(info.type, table);
        const countResult = sqdb.exec(`SELECT COUNT(*) AS total FROM ${tableSql}${where.sql}`);
        total = countResult[0]?.values[0]?.[0] || 0;
        const dataResult = sqdb.exec(`SELECT * FROM ${tableSql}${where.sql}${orderSql} LIMIT ${limit} OFFSET ${offset}`);
        if (dataResult[0]) {
          columns = dataResult[0].columns;
          rows = dataResult[0].values.map((vals: any[]) => {
            const row: Record<string, any> = {};
            columns.forEach((col: string, i: number) => {
              row[col] = vals[i];
            });
            return row;
          });
        }
      }

      res.json({ columns, rows, total, page, pageSize: limit, tableInfo });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error querying records:", err);
    res.status(500).json({ error: `Failed to query records: ${err.message}` });
  }
}

export async function updateRecord(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, key, values } = req.body;

  if (!table?.trim()) return res.status(400).json({ error: "table name is required" });
  if (!key || typeof key !== "object") return res.status(400).json({ error: "record key is required" });
  if (!values || typeof values !== "object") return res.status(400).json({ error: "update values are required" });

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
    if (info.type === "sqlite") return res.status(400).json({ error: "Record editing is not supported for SQLite catalogs" });

    const connector = getConnector(info.type);
    const { client, release } = await connector.connect(info);
    try {
      const schema = await connector.fetchSchema(client, info);
      const tableSchema = schema.find((item: any) => item.table_name === table);
      if (!tableSchema) return res.status(400).json({ error: "Invalid table name" });

      const allowedColumns = new Set((tableSchema.columns || []).map((column: any) => column.name));
      const pkColumns = (tableSchema.columns || []).filter((column: any) => column.is_pk).map((column: any) => column.name);
      if (pkColumns.length === 0) return res.status(400).json({ error: "Table has no primary key" });
      for (const column of pkColumns) {
        if (!(column in key)) return res.status(400).json({ error: `Missing primary key column: ${column}` });
      }

      let update;
      try {
        update = buildRecordUpdate(info.type, values, key, allowedColumns);
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Invalid update options" });
      }

      const tableSql = quoteIdentifier(info.type, table);
      if (info.type === "postgresql") {
        await (client as any).query(`UPDATE ${tableSql}${update.sql}`, update.params);
      } else {
        await (client as any).execute(`UPDATE ${tableSql}${update.sql}`, update.params);
      }

      res.json({ success: true });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error updating record:", err);
    res.status(500).json({ error: `Failed to update record: ${err.message}` });
  }
}
