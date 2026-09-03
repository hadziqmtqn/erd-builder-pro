import { describe, expect, it } from 'vitest';
import { buildSqlCompletions, buildSqlSuggestionSource } from './query-autocomplete';

describe('buildSqlCompletions', () => {
  const tables = [
    { table_name: 'users', columns: [{ name: 'id' }, { name: 'email' }], foreign_keys: [{ column: 'role_id', ref_table: 'roles', ref_column: 'id' }] },
    { table_name: 'posts', columns: [{ name: 'id' }, { name: 'user_id' }] },
    { table_name: 'roles', columns: [{ name: 'id' }, { name: 'name' }] },
  ];
  const context = (sql: string, pos = sql.length) => ({
    explicit: true,
    pos,
    state: { doc: { toString: () => sql } },
    matchBefore: () => ({ from: pos, to: pos, text: '' }),
  } as any);

  it('only suggests columns from tables referenced by the active statement', () => {
    const source = buildSqlCompletions(tables);
    const sql = 'SELECT u. FROM users AS u';
    const options = source(context(sql, sql.indexOf(' FROM')))?.options || [];

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'u.email' }),
      expect.objectContaining({ label: 'users' }),
    ]));
    expect(options).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'posts' }),
      expect.objectContaining({ label: 'posts.user_id' }),
      expect.objectContaining({ label: 'roles.name' }),
    ]));
  });

  it('offers all table names only while completing a table reference', () => {
    const source = buildSqlCompletions(tables);
    const options = source(context('SELECT * FROM po'))?.options || [];

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'users' }),
      expect.objectContaining({ label: 'posts' }),
      expect.objectContaining({ label: 'roles' }),
    ]));
    expect(options).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: 'posts.user_id' })]));
  });

  it('scopes references to the statement containing the cursor', () => {
    const source = buildSqlCompletions(tables);
    const sql = 'SELECT * FROM posts; SELECT u. FROM users u';
    const options = source(context(sql))?.options || [];

    expect(options).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'u.email' })]));
    expect(options).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: 'posts.user_id' })]));
  });

  it('builds JOIN completions from foreign keys on referenced tables', () => {
    const source = buildSqlCompletions(tables);
    const options = source(context('SELECT * FROM users u JOIN ro'))?.options || [];

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'roles',
        apply: 'roles ON u.role_id = roles.id',
      }),
    ]));
  });

  it('filters and caps native textarea suggestions', () => {
    const source = buildSqlSuggestionSource(tables);
    const suggestions = source('SELECT * FROM po', 'SELECT * FROM po'.length, 1);

    expect(suggestions).toEqual([
      expect.objectContaining({ label: 'posts', detail: 'table' }),
    ]);
  });

  it('suggests columns from tables introduced by JOIN while completing ON', () => {
    const source = buildSqlSuggestionSource([
      ...tables,
      { table_name: 'ppdbs', columns: [{ name: 'siswa_id' }] },
    ]);
    const sql = 'SELECT siswas.nama,\n  siswas.nama_ayah\nFROM siswas\nJOIN ppdbs ON ppdbs.siswa_id = siswas.id';
    const suggestions = source(sql, sql.indexOf('ppdbs.siswa_id') + 'ppdbs.sis'.length);

    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'ppdbs.siswa_id' }),
    ]));
  });
});
