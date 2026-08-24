export interface RecordsResult {
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
  tableInfo?: {
    dataSize: number | null;
    indexSize: number | null;
    totalSize: number | null;
  };
}

export interface OpenTableTab {
  name: string;
  pinned: boolean;
}

export interface RecordFilter {
  id: string;
  enabled: boolean;
  column: string;
  operator: string;
  value: string;
  value2?: string;
}

export interface RecordSort {
  column: string;
  direction: 'asc' | 'desc';
}

export const DATA_VIEWER_STORAGE_PREFIX = 'erd-production-db-tabs:';

// ponytail: bounded in-memory cache stays fresh until Refresh/mutation; add TTL only if external changes must appear automatically.
const recordCaches = new Map<number, Map<string, RecordsResult>>();
const schemaCaches = new Map<number, any>();
const dbClientCaches = new Map<string, any>();

export function getRecordCache(connectionId: number) {
  let cache = recordCaches.get(connectionId);
  if (!cache) {
    cache = new Map();
    recordCaches.set(connectionId, cache);
    if (recordCaches.size > 5) recordCaches.delete(recordCaches.keys().next().value!);
  }
  return cache;
}

export const getSchemaCache = (connectionId: number) => schemaCaches.get(connectionId);
export const setSchemaCache = (connectionId: number, schema: any) => {
  schemaCaches.set(connectionId, schema);
  if (schemaCaches.size > 5) schemaCaches.delete(schemaCaches.keys().next().value!);
};
export const clearSchemaCache = (connectionId: number) => schemaCaches.delete(connectionId);
export const getDbClientCache = (id: string | number) => dbClientCaches.get(String(id));
export const setDbClientCache = (client: any) => {
  if (client?.id != null) dbClientCaches.set(String(client.id), client);
  if (client?.uid) dbClientCaches.set(String(client.uid), client);
  if (dbClientCaches.size > 10) dbClientCaches.delete(dbClientCaches.keys().next().value!);
};

export const makeRecordFilter = (column = ''): RecordFilter => ({
  id: crypto.randomUUID(),
  enabled: true,
  column,
  operator: 'CONTAINS',
  value: '',
  value2: '',
});
