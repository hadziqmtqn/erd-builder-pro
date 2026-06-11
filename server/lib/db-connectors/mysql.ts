import mysql from "mysql2/promise";
import type { ConnectionInfo, ConnectorClient, TableSchema, DbConnector } from "./types.js";

export const mysqlConnector: DbConnector = {
  async connect(info: ConnectionInfo): Promise<ConnectorClient> {
    const conn = await mysql.createConnection({
      host: info.host || "localhost",
      port: info.port || 3306,
      user: info.user || "root",
      password: info.password || "",
      database: info.database,
      connectTimeout: 5000,
    });
    return { client: conn, release: () => conn.end() };
  },

  async test(info: ConnectionInfo): Promise<string> {
    const start = Date.now();
    const conn = await mysql.createConnection({
      host: info.host || "localhost",
      port: info.port || 3306,
      user: info.user || "root",
      password: info.password || "",
      database: info.database,
      connectTimeout: 5000,
    });
    await conn.end();
    return `OK (${Date.now() - start}ms)`;
  },

  async fetchSchema(client: any, info: ConnectionInfo): Promise<TableSchema[]> {
    const conn = client as mysql.Connection;
    const [tables] = await conn.execute(`
      SELECT
        t.TABLE_NAME AS table_name,
        t.TABLE_SCHEMA AS table_schema,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'name', c.COLUMN_NAME,
              'type', c.DATA_TYPE,
              'is_pk', c.COLUMN_KEY = 'PRI',
              'is_nullable', c.IS_NULLABLE = 'YES',
              'sort_order', c.ORDINAL_POSITION
            )
          )
          FROM information_schema.COLUMNS c
          WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND c.TABLE_NAME = t.TABLE_NAME
        ) AS columns
      FROM information_schema.TABLES t
      WHERE t.TABLE_SCHEMA = ?
        AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_NAME
    `, [info.database]);
    return tables as any[];
  },
};
