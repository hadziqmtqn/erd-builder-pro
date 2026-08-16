import pg from "pg";
import type { ConnectionInfo, ConnectorClient, TableSchema, DbConnector } from "./types.js";
import { tlsOptions } from "./security.js";

const pools = new Map<string, pg.Pool>();

const connectionConfig = (info: ConnectionInfo) => ({
  host: info.host || "localhost",
  port: info.port || 5432,
  user: info.user || "postgres",
  password: info.password || "",
  database: info.database,
  ssl: tlsOptions(info),
});

function getPool(info: ConnectionInfo) {
  const key = JSON.stringify(info);
  let pool = pools.get(key);
  if (!pool) {
    pool = new pg.Pool({
      ...connectionConfig(info),
      max: 4,
      idleTimeoutMillis: 30_000,
      statement_timeout: info.queryTimeoutMs || 30_000,
      query_timeout: info.queryTimeoutMs || 30_000,
    });
    pools.set(key, pool);
  }
  return pool;
}

export const postgresqlConnector: DbConnector = {
  async connect(info: ConnectionInfo): Promise<ConnectorClient> {
    const pool = getPool(info);
    const client = await pool.connect();
    try {
      await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION ${info.safeMode === "read-only" ? "READ ONLY" : "READ WRITE"}`);
    } catch (error) {
      client.release();
      throw error;
    }
    return {
      client,
      release: () => client.release(),
      cancel: async () => {
        const cancelClient = new pg.Client(connectionConfig(info));
        await cancelClient.connect();
        try { await cancelClient.query("SELECT pg_cancel_backend($1)", [(client as any).processID]); }
        finally { await cancelClient.end(); }
      },
    };
  },

  async test(info: ConnectionInfo): Promise<string> {
    const start = Date.now();
    const pool = new pg.Pool({
      ...connectionConfig(info),
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
          obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass, 'pg_class') AS table_comment,
          (
            SELECT json_agg(
              json_build_object(
                'name', c.column_name,
                'type', CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END,
                'full_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
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
            JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
            JOIN pg_catalog.pg_class cl ON cl.relnamespace = n.oid AND cl.relname = c.table_name
            JOIN pg_catalog.pg_attribute a ON a.attrelid = cl.oid AND a.attname = c.column_name AND a.attnum > 0 AND NOT a.attisdropped
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
          tc.constraint_name,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_schema = tc.constraint_schema
          AND rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      ),
      check_data AS (
        SELECT tc.table_schema, tc.table_name,
          json_agg(json_build_object('name', tc.constraint_name, 'expression', cc.check_clause)) AS checks
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON cc.constraint_schema = tc.constraint_schema
          AND cc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'CHECK'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
        GROUP BY tc.table_schema, tc.table_name
      )
      SELECT
        td.table_name,
        td.table_schema,
        td.table_comment,
        td.columns,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'column', fd.source_column,
              'ref_table', fd.target_table,
              'ref_column', fd.target_column,
              'constraint_name', fd.constraint_name,
              'on_delete', fd.delete_rule,
              'on_update', fd.update_rule
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
        ) AS indexes,
        COALESCE(cd.checks, '[]'::json) AS checks
      FROM table_data td
      LEFT JOIN check_data cd
        ON cd.table_schema = td.table_schema
        AND cd.table_name = td.table_name
      ORDER BY td.table_name
    `);
    return result.rows.map((row: any) => ({
      table_name: row.table_name,
      table_schema: row.table_schema,
      comment: row.table_comment || null,
      columns: row.columns || [],
      foreign_keys: row.foreign_keys || [],
      indexes: row.indexes || [],
      checks: row.checks || [],
    }));
  },
};
