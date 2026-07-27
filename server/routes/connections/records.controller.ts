import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { getConnector } from "../../lib/db-connectors/registry.js";
import { buildConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import {
  buildRecordOrder,
  buildRecordDelete,
  buildRecordInsert,
  buildRecordUpdate,
  buildRecordWhere,
  fetchTableInfo,
  quoteIdentifier,
  validateRecordValues,
} from "./record-helpers.js";

async function recordContext(req: ExpressRequest, id: string, table: string) {
  const userId = (req as any).user.id;
  const catalog = await catalogsService.findCatalogById(id, userId);
  if (!catalog) throw new Error("Catalog not found");
  const info = buildConnectionInfo({
    type: (catalog as any).account.type,
    host: (catalog as any).account.host,
    port: (catalog as any).account.port,
    user: (catalog as any).account.user,
    password: (catalog as any).account.password,
    database: (catalog as any).databaseName,
  });
  if (info.type === "sqlite") throw new Error("Record editing is not supported for SQLite catalogs");
  const connector = getConnector(info.type);
  const { client, release } = await connector.connect(info);
  const schema = await connector.fetchSchema(client, info);
  const tableSchema = schema.find((item: any) => item.table_name === table);
  if (!tableSchema) {
    release();
    throw new Error("Invalid table name");
  }
  return { info, client, release, tableSchema };
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
      const tableSql = quoteIdentifier(info.type, table);

      if (info.type === "postgresql") {
        const countRes = await (client as any).query(`SELECT COUNT(*)::int AS total FROM ${tableSql}${where.sql}`, where.params);
        total = countRes.rows[0]?.total || 0;
        const dataRes = await (client as any).query(`SELECT * FROM ${tableSql}${where.sql}${orderSql} LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`, [...where.params, limit, offset]);
        columns = dataRes.fields.map((f: any) => f.name);
        rows = dataRes.rows;
      } else if (info.type === "mysql") {
        const [countRows] = await (client as any).execute(`SELECT COUNT(*) AS total FROM ${tableSql}${where.sql}`, where.params);
        total = countRows[0]?.total || 0;
        const [dataRows, dataFields] = await (client as any).execute(`SELECT * FROM ${tableSql}${where.sql}${orderSql} LIMIT ${limit} OFFSET ${offset}`, where.params);
        columns = (dataFields || []).map((f: any) => f.name || f.column || f);
        rows = dataRows;
      } else if (info.type === "sqlite") {
        const countResult = (client as any).exec(`SELECT COUNT(*) AS total FROM ${tableSql}${where.sql}`);
        total = countResult[0]?.values[0]?.[0] || 0;
        const dataResult = (client as any).exec(`SELECT * FROM ${tableSql}${where.sql}${orderSql} LIMIT ${limit} OFFSET ${offset}`);
        if (dataResult[0]) {
          columns = dataResult[0].columns;
          rows = dataResult[0].values.map((vals: any[]) => Object.fromEntries(columns.map((col, i) => [col, vals[i]])));
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

      const columnByName = new Map<string, any>((tableSchema.columns || []).map((column: any) => [column.name, column]));
      const allowedColumns = new Set(columnByName.keys());
      const pkColumns = (tableSchema.columns || []).filter((column: any) => column.is_pk).map((column: any) => column.name);
      if (pkColumns.length === 0) return res.status(400).json({ error: "Table has no primary key" });
      for (const column of pkColumns) {
        if (!(column in key)) return res.status(400).json({ error: `Missing primary key column: ${column}` });
      }

      let normalizedValues;
      try {
        normalizedValues = validateRecordValues(info.type, values, columnByName);
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Invalid update values" });
      }

      let update;
      try {
        update = buildRecordUpdate(info.type, normalizedValues, key, allowedColumns);
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

export async function createRecord(req: ExpressRequest, res: ExpressResponse) {
  const { id } = req.params;
  const { table, values } = req.body;
  if (!table?.trim()) return res.status(400).json({ error: "table name is required" });
  if (!values || typeof values !== "object") return res.status(400).json({ error: "insert values are required" });

  try {
    const { info, client, release, tableSchema } = await recordContext(req, id, table);
    try {
      const columnByName = new Map<string, any>((tableSchema.columns || []).map((column: any) => [column.name, column]));
      const allowedColumns = new Set(columnByName.keys());
      const normalizedValues = validateRecordValues(info.type, values, columnByName, true);
      const insert = buildRecordInsert(info.type, normalizedValues, allowedColumns);
      const tableSql = quoteIdentifier(info.type, table);
      if (info.type === "postgresql") await (client as any).query(`INSERT INTO ${tableSql}${insert.sql}`, insert.params);
      else await (client as any).execute(`INSERT INTO ${tableSql}${insert.sql}`, insert.params);
      res.status(201).json({ success: true });
    } finally {
      release();
    }
  } catch (err: any) {
    const status = /Catalog not found/.test(err.message) ? 404 : 400;
    res.status(status).json({ error: `Failed to create record: ${err.message}` });
  }
}

export async function deleteRecord(req: ExpressRequest, res: ExpressResponse) {
  const { id } = req.params;
  const { table, key, keys } = req.body;
  if (!table?.trim()) return res.status(400).json({ error: "table name is required" });
  const keyList = Array.isArray(keys) ? keys : key ? [key] : [];
  if (keyList.length === 0 || keyList.some(item => !item || typeof item !== "object")) return res.status(400).json({ error: "record key is required" });

  try {
    const { info, client, release, tableSchema } = await recordContext(req, id, table);
    try {
      const allowedColumns = new Set((tableSchema.columns || []).map((column: any) => column.name));
      const pkColumns = (tableSchema.columns || []).filter((column: any) => column.is_pk).map((column: any) => column.name);
      if (pkColumns.length === 0) return res.status(400).json({ error: "Table has no primary key" });
      for (const item of keyList) {
        for (const column of pkColumns) {
          if (!(column in item)) return res.status(400).json({ error: `Missing primary key column: ${column}` });
        }
      }
      const tableSql = quoteIdentifier(info.type, table);
      for (const item of keyList) {
        const del = buildRecordDelete(info.type, item, allowedColumns);
        if (info.type === "postgresql") await (client as any).query(`DELETE FROM ${tableSql}${del.sql}`, del.params);
        else await (client as any).execute(`DELETE FROM ${tableSql}${del.sql}`, del.params);
      }
      res.json({ success: true });
    } finally {
      release();
    }
  } catch (err: any) {
    const status = /Catalog not found/.test(err.message) ? 404 : 400;
    res.status(status).json({ error: `Failed to delete record: ${err.message}` });
  }
}
