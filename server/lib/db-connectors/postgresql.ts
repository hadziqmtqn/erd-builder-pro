import pg from "pg";
import type { ConnectionInfo, ConnectorClient, TableSchema, DbConnector } from "./types.js";

export const postgresqlConnector: DbConnector = {
  async connect(info: ConnectionInfo): Promise<ConnectorClient> {
    const pool = new pg.Pool({
      host: info.host || "localhost",
      port: info.port || 5432,
      user: info.user || "postgres",
      password: info.password || "",
      database: info.database,
      max: 2,
      idleTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    return { client, release: () => client.release() };
  },

  async test(info: ConnectionInfo): Promise<string> {
    const start = Date.now();
    const pool = new pg.Pool({
      host: info.host || "localhost",
      port: info.port || 5432,
      user: info.user || "postgres",
      password: info.password || "",
      database: info.database,
      max: 2,
      idleTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    client.release();
    await pool.end();
    return `OK (${Date.now() - start}ms)`;
  },

  async fetchSchema(client: any, _info: ConnectionInfo): Promise<TableSchema[]> {
    const pgClient = client as pg.PoolClient;
    const result = await pgClient.query(`
      WITH table_data AS (
        SELECT
          t.table_name,
          t.table_schema,
          (
            SELECT json_agg(
              json_build_object(
                'name', c.column_name,
                'type', c.data_type,
                'is_pk', COALESCE(pk.column_name IS NOT NULL, false),
                'is_nullable', c.is_nullable = 'YES',
                'sort_order', c.ordinal_position
              ) ORDER BY c.ordinal_position
            )
            FROM information_schema.columns c
            LEFT JOIN (
              SELECT ku.column_name
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage ku
                ON tc.constraint_name = ku.constraint_name
                AND tc.table_schema = ku.table_schema
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = t.table_schema
                AND tc.table_name = t.table_name
            ) pk ON c.column_name = pk.column_name
            WHERE c.table_schema = t.table_schema
              AND c.table_name = t.table_name
          ) AS columns
        FROM information_schema.tables t
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
          AND t.table_type = 'BASE TABLE'
      ),
      fk_data AS (
        SELECT
          kcu.table_schema AS source_schema,
          kcu.table_name AS source_table,
          kcu.column_name AS source_column,
          ccu.table_schema AS target_schema,
          ccu.table_name AS target_table,
          ccu.column_name AS target_column,
          tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      )
      SELECT
        td.table_name,
        td.table_schema,
        td.columns,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'column', fd.source_column,
              'ref_table', fd.target_table,
              'ref_column', fd.target_column,
              'constraint_name', fd.constraint_name
            )
          )
          FROM fk_data fd
          WHERE fd.source_schema = td.table_schema
            AND fd.source_table = td.table_name),
          '[]'::json
        ) AS foreign_keys
      FROM table_data td
      ORDER BY td.table_name
    `);
    return result.rows.map((row: any) => ({
      table_name: row.table_name,
      table_schema: row.table_schema,
      columns: row.columns || [],
      foreign_keys: row.foreign_keys || [],
    }));
  },
};
