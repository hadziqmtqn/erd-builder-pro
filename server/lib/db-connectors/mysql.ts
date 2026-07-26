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
              'full_type', c.COLUMN_TYPE,
              'character_set', c.CHARACTER_SET_NAME,
              'collation', c.COLLATION_NAME,
              'column_default', c.COLUMN_DEFAULT,
              'extra', c.EXTRA,
              'comment', c.COLUMN_COMMENT,
              'is_pk', c.COLUMN_KEY = 'PRI',
              'is_nullable', c.IS_NULLABLE = 'YES',
              'sort_order', c.ORDINAL_POSITION,
              'max_length', c.CHARACTER_MAXIMUM_LENGTH,
              'numeric_precision', c.NUMERIC_PRECISION,
              'numeric_scale', c.NUMERIC_SCALE,
              'is_generated', c.EXTRA LIKE '%GENERATED%',
              'enum_values', CASE
                WHEN c.DATA_TYPE IN ('enum', 'set') THEN c.COLUMN_TYPE
                ELSE NULL
              END
            )
          )
          FROM information_schema.COLUMNS c
          WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND c.TABLE_NAME = t.TABLE_NAME
        ) AS columns,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'column', kcu.COLUMN_NAME,
              'ref_table', kcu.REFERENCED_TABLE_NAME,
              'ref_column', kcu.REFERENCED_COLUMN_NAME,
              'constraint_name', kcu.CONSTRAINT_NAME
            )
          )
          FROM information_schema.KEY_COLUMN_USAGE kcu
          WHERE kcu.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND kcu.TABLE_NAME = t.TABLE_NAME
            AND kcu.REFERENCED_TABLE_NAME IS NOT NULL),
          JSON_ARRAY()
        ) AS foreign_keys,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'name', s.INDEX_NAME,
              'algorithm', s.INDEX_TYPE,
              'is_unique', s.NON_UNIQUE = 0,
              'column_name', s.column_names
            )
          )
          FROM (
            SELECT INDEX_NAME, INDEX_TYPE, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS column_names
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = t.TABLE_SCHEMA
              AND TABLE_NAME = t.TABLE_NAME
            GROUP BY INDEX_NAME, INDEX_TYPE, NON_UNIQUE
          ) s),
          JSON_ARRAY()
        ) AS indexes
      FROM information_schema.TABLES t
      WHERE t.TABLE_SCHEMA = ?
        AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_NAME
    `, [info.database]);
    return (tables as any[]).map((row: any) => ({
      table_name: row.table_name,
      table_schema: row.table_schema,
      columns: row.columns || [],
      foreign_keys: row.foreign_keys || [],
      indexes: row.indexes || [],
    }));
  },
};
