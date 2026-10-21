import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./postgresql.js', () => ({ postgresqlConnector: {} }));
vi.mock('./mysql.js', () => ({ mysqlConnector: {} }));
vi.mock('./sqlite.js', () => ({ sqliteConnector: {} }));
import { fetchSchemaForClient, invalidateSchemaCache, registerConnector } from './registry.js';
import type { ConnectionInfo, TableSchema } from './types.js';

const info: ConnectionInfo = { type: 'postgresql', database: 'synthetic-startup' };
const fetchSchema = vi.fn();
const schema = Array.from({ length: 30 }, (_, i) => ({ table_name: `table_${i}`, columns: Array.from({ length: 50 }, (_, c) => ({ name: `column_${c}` })) })) as TableSchema[];
const deferred = () => { let resolve!: (value: TableSchema[]) => void; let reject!: (error: Error) => void; const promise = new Promise<TableSchema[]>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => { invalidateSchemaCache(info); fetchSchema.mockReset(); registerConnector('postgresql', { fetchSchema } as any); });

it('shares one cold schema query between concurrent table-list and record requests', async () => {
  const query = deferred(); fetchSchema.mockReturnValue(query.promise);
  const tableList = fetchSchemaForClient({ id: 1 }, info);
  const records = fetchSchemaForClient({ id: 2 }, info);
  expect(fetchSchema).toHaveBeenCalledTimes(1);
  query.resolve(schema);
  expect(await tableList).toBe(schema); expect(await records).toBe(schema);
  expect(await fetchSchemaForClient({}, info)).toBe(schema);
  expect(fetchSchema).toHaveBeenCalledTimes(1);
});

it('does not repopulate cache with an invalidated query or remove its replacement', async () => {
  const old = deferred(), fresh = deferred();
  fetchSchema.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const first = fetchSchemaForClient({}, info);
  invalidateSchemaCache(info);
  const second = fetchSchemaForClient({}, info);
  old.resolve([]); await first;
  const third = fetchSchemaForClient({}, info);
  expect(fetchSchema).toHaveBeenCalledTimes(2);
  fresh.resolve(schema);
  expect(await second).toBe(schema); expect(await third).toBe(schema);
  expect(await fetchSchemaForClient({}, info)).toBe(schema);
});

it('retries after failure and isolates connection credentials', async () => {
  const query = deferred(); fetchSchema.mockReturnValueOnce(query.promise);
  const first = fetchSchemaForClient({}, info), second = fetchSchemaForClient({}, info);
  const failures = Promise.allSettled([first, second]); query.reject(new Error('timeout'));
  expect((await failures).every(result => result.status === 'rejected')).toBe(true);
  fetchSchema.mockResolvedValue(schema);
  await fetchSchemaForClient({}, info);
  await fetchSchemaForClient({}, { ...info, user: 'another-user' });
  expect(fetchSchema).toHaveBeenCalledTimes(3);
});
