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

export function registerConnector(type: string, connector: DbConnector): void {
  connectors[type] = connector;
}

export function getConnector(type: string): DbConnector {
  const c = connectors[type];
  if (!c) throw new Error(`Unsupported DB type: ${type}`);
  return c;
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
    return await getConnector(info.type).fetchSchema(client, info);
  } finally {
    release();
  }
}
