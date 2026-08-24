import { describe, expect, it } from 'vitest';
import { buildSqlCompletions } from './query-autocomplete';

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
});
