import pg from "pg";
import type { ConnectionInfo, ConnectorClient, TableSchema, DbConnector } from "./types.js";

const pools = new Map<string, pg.Pool>();

function getPool(info: ConnectionInfo) {
  const key = JSON.stringify(info);
  let pool = pools.get(key);
  if (!pool) {
    pool = new pg.Pool({
      host: info.host || "localhost",
      port: info.port || 5432,
      user: info.user || "postgres",
      password: info.password || "",
      database: info.database,
      max: 4,
      idleTimeoutMillis: 30_000,
    });
    pools.set(key, pool);
  }
  return pool;
}

export const postgresqlConnector: DbConnector = {
  async connect(info: ConnectionInfo): Promise<ConnectorClient> {
    const pool = getPool(info);
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
                'type', CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END,
                'full_type', c.data_type,
                'collation', c.collation_name,
                'column_default', c.column_default,
                'extra', CASE
                  WHEN c.is_identity = 'YES' THEN 'identity'
                  WHEN c.is_generated = 'ALWAYS' THEN 'generated'
                  ELSE ''
                END,
                'is_pk', COALESCE(pk.column_name IS NOT NULL, false),
                'is_nullable', c.is_nullable = 'YES',
                'sort_order', c.ordinal_position,
                'max_length', c.character_maximum_length,
                'numeric_precision', c.numeric_precision,
                'numeric_scale', c.numeric_scale,
                'is_generated', c.is_generated = 'ALWAYS' OR c.is_identity = 'YES',
                'enum_values', (
                  SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder)
                  FROM pg_type pt
                  JOIN pg_enum e ON e.enumtypid = pt.oid
                  JOIN pg_namespace pn ON pn.oid = pt.typnamespace
                  WHERE pt.typname = c.udt_name
                    AND pn.nspname = c.udt_schema
                )
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
        ) AS foreign_keys,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'name', idx.index_name,
            'algorithm', idx.algorithm,
            'is_unique', idx.is_unique,
            'is_primary', idx.is_primary,
            'column_name', idx.column_name
          ) ORDER BY idx.index_name)
          FROM (
            SELECT
              ci.relname AS index_name,
              am.amname AS algorithm,
              ix.indisunique AS is_unique,
              ix.indisprimary AS is_primary,
              string_agg(a.attname, ',' ORDER BY cols.ordinality) AS column_name
            FROM pg_index ix
            JOIN pg_class ct ON ct.oid = ix.indrelid
            JOIN pg_namespace ns ON ns.oid = ct.relnamespace
            JOIN pg_class ci ON ci.oid = ix.indexrelid
            JOIN pg_am am ON am.oid = ci.relam
            JOIN unnest(ix.indkey) WITH ORDINALITY AS cols(attnum, ordinality) ON true
            JOIN pg_attribute a ON a.attrelid = ct.oid AND a.attnum = cols.attnum
            WHERE ns.nspname = td.table_schema
              AND ct.relname = td.table_name
            GROUP BY ci.relname, am.amname, ix.indisunique, ix.indisprimary
          ) idx),
          '[]'::json
        ) AS indexes
      FROM table_data td
      ORDER BY td.table_name
    `);
    return result.rows.map((row: any) => ({
      table_name: row.table_name,
      table_schema: row.table_schema,
      columns: row.columns || [],
      foreign_keys: row.foreign_keys || [],
      indexes: row.indexes || [],
    }));
  },
};
