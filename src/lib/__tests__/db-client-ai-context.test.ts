import { describe, expect, it } from 'vitest';
import { buildDbClientQueryContext, buildDbClientTableContext } from '../db-client-ai-context';

describe('DB Client AI context', () => {
  it('includes live schema metadata without record values or credentials', () => {
    const context = buildDbClientTableContext({
      dbType: 'postgresql',
      activeView: 'structure',
      tableCount: 2,
      table: {
        table_schema: 'public',
        table_name: 'users',
        columns: [{ name: 'id', full_type: 'uuid', is_pk: true, is_nullable: false }],
        foreign_keys: [],
        indexes: [{ name: 'users_pkey', column_name: 'id', is_primary: true }],
      },
    });
    expect(context).toContain('Dialect: postgresql');
    expect(context).toContain('Selected table: public.users');
    expect(context).toContain('users_pkey');
    expect(context).toContain('metadata only');
  });

  it('labels active SQL as unexecuted and keeps the dialect', () => {
    const context = buildDbClientQueryContext('mysql', { name: 'Users', script: 'SELECT id FROM users' }, [
      { table_name: 'users', columns: [{ name: 'id' }] },
    ]);
    expect(context).toContain('Dialect: mysql');
    expect(context).toContain('SELECT id FROM users');
    expect(context).toContain('has not been executed by the AI');
  });
});
