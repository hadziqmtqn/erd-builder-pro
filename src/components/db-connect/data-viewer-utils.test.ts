import { describe, expect, it } from 'vitest';
import { createColumnHelpers, DEFAULT_VALUE, draftValue, isDefaultValue, loadColumnWidths, quoteTableName, saveColumnWidths, submitValue } from './data-viewer-utils';

const helpers = createColumnHelpers(new Map<string, any>([
  ['id', { type: 'bigint' }],
  ['amount', { type: 'decimal' }],
  ['ratio', { type: 'double precision' }],
  ['flag', { type: 'tinyint', full_type: 'tinyint(1)' }],
]));

describe('submitValue numeric precision', () => {
  it('keeps BIGINT and DECIMAL text exact through draft and submit', () => {
    expect(submitValue('id', draftValue('id', '9007199254740993', helpers), helpers)).toBe('9007199254740993');
    expect(submitValue('amount', draftValue('amount', '1234567890123456.78', helpers), helpers)).toBe('1234567890123456.78');
    expect(submitValue('id', ' 42 ', helpers)).toBe('42');
  });

  it('keeps floats numeric and preserves empty, NULL and boolean handling', () => {
    expect(submitValue('ratio', '0.5', helpers)).toBe(0.5);
    expect(submitValue('id', '', helpers)).toBe('');
    expect(submitValue('flag', '1', helpers)).toBe(1);
    expect(submitValue('flag', '', helpers)).toBeNull();
  });
});

describe('quoteTableName', () => {
  it('quotes schema and name separately only for schema-qualified keys', () => {
    expect(quoteTableName('postgresql', { table_name: 'tenant.users', table_schema: 'tenant', base_name: 'users' })).toBe('"tenant"."users"');
    expect(quoteTableName('postgresql', { table_name: 'users', table_schema: 'public', base_name: 'users' })).toBe('"users"');
    expect(quoteTableName('mysql', { table_name: 'users', table_schema: 'app' })).toBe('`users`');
  });
});

describe('draft cell kinds', () => {
  it('keeps NULL, empty text and the DEFAULT marker apart', () => {
    expect(isDefaultValue(DEFAULT_VALUE)).toBe(true);
    for (const other of [null, '', 'DEFAULT', "'none'::text", { sqlDefault: true }]) expect(isDefaultValue(other)).toBe(false);
    expect(submitValue('name', '', helpers)).toBe('');
    expect(draftValue('name', null, helpers)).toBe('');
  });
});

describe('column width persistence', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };

  it('round-trips widths per connection', () => {
    const storage = memory();
    saveColumnWidths(1, { users: { id: 80 } }, storage);
    expect(loadColumnWidths(1, storage)).toEqual({ users: { id: 80 } });
    expect(loadColumnWidths(2, storage)).toEqual({});
  });

  it('ignores corrupt, tampered or unavailable storage', () => {
    const storage = memory();
    storage.setItem('erd-db-column-widths:1', '{bad json');
    expect(loadColumnWidths(1, storage)).toEqual({});
    storage.setItem('erd-db-column-widths:1', JSON.stringify({ users: { id: 'wide', name: 120 }, orders: 5, list: [] }));
    expect(loadColumnWidths(1, storage)).toEqual({ users: { name: 120 }, list: {} });
    expect(loadColumnWidths(1, undefined)).toEqual({});
    expect(() => saveColumnWidths(1, {}, { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });
});
