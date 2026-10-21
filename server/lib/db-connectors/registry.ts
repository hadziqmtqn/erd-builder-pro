import type { DbType, ConnectionInfo, ConnectorClient, TableSchema, DbConnector } from "./types.js";
import { postgresqlConnector } from "./postgresql.js";
import { mysqlConnector } from "./mysql.js";
import { sqliteConnector } from "./sqlite.js";

// ── Registry — tambah connector baru disini ──
const connectors: Record<string, DbConnector> = {
  postgresql: postgresqlConnector,
  mysql: mysqlConnector,
  sqlite: sqliteConnector,
};

// ponytail: short TTL avoids a schema query on every record request; structure writes invalidate it.
const schemaCache = new Map<string, { expiresAt: number; schema: TableSchema[] }>();
const pendingSchemas = new Map<string, Promise<TableSchema[]>>();
const SCHEMA_CACHE_TTL_MS = 5_000;

function schemaCacheKey(info: ConnectionInfo) {
  return JSON.stringify(info);
}

export function registerConnector(type: string, connector: DbConnector): void {
  connectors[type] = connector;
}

export function getConnector(type: string): DbConnector {
  const c = connectors[type];
  if (!c) throw new Error(`Unsupported DB type: ${type}`);
  return c;
}

export async function fetchSchemaForClient(client: any, info: ConnectionInfo): Promise<TableSchema[]> {
  const key = schemaCacheKey(info);
  const cached = schemaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.schema;
  const pending = pendingSchemas.get(key);
  if (pending) return pending;
  const request = getConnector(info.type).fetchSchema(client, info);
  pendingSchemas.set(key, request);
  try {
    const schema = await request;
    // A structure mutation may invalidate this request while its query is still running.
    if (pendingSchemas.get(key) === request) schemaCache.set(key, { expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS, schema });
    return schema;
  } finally {
    if (pendingSchemas.get(key) === request) pendingSchemas.delete(key);
  }
}

export function invalidateSchemaCache(info: ConnectionInfo) {
  schemaCache.delete(schemaCacheKey(info));
  pendingSchemas.delete(schemaCacheKey(info));
}

export async function connectExternal(info: ConnectionInfo): Promise<ConnectorClient> {
  return getConnector(info.type).connect(info);
}

export async function testConnection(info: ConnectionInfo): Promise<string> {
  return getConnector(info.type).test(info);
}

export async function fetchSchema(info: ConnectionInfo): Promise<TableSchema[]> {
  const { client, release } = await getConnector(info.type).connect(info);
  try {
    return await fetchSchemaForClient(client, info);
  } finally {
    release();
  }
}
