import { describe, expect, it } from 'vitest';
import { buildSqlCompletions } from './query-autocomplete';

describe('buildSqlCompletions', () => {
  it('reuses prebuilt options for large schemas while typing', () => {
    const source = buildSqlCompletions([
      { table_name: 'users', columns: [{ name: 'id' }, { name: 'email' }] },
      { table_name: 'posts', columns: [{ name: 'id' }, { name: 'user_id' }] },
    ], 'users');
    const context = { explicit: true, pos: 1, matchBefore: () => ({ from: 0, to: 1, text: 'u' }) } as any;

    const first = source(context);
    const second = source(context);

    expect(first?.options).toBe(second?.options);
    expect(first?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'users.email' }),
      expect.objectContaining({ label: 'posts.user_id' }),
    ]));
  });
});
