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
      ORDER BY t.table_name
    `);
    return result.rows;
  },
};
