import { describe, expect, it } from 'vitest';
import { getDBMLSuggestions, type DBMLTableData } from './DBMLEditorCompletions';

const tables: DBMLTableData = {
  names: ['users', 'posts'],
  cols: new Map([
    ['users', ['id', 'email']],
    ['posts', ['id', 'user_id']],
  ]),
};

describe('getDBMLSuggestions', () => {
  it('returns context-aware keyword, type, setting, table, and column suggestions', () => {
    const typeSource = 'Table posts {\n  id IN';
    const settingSource = 'Table posts {\n  id INT [p';
    const tableSource = 'Ref: posts.user_id > us';
    expect(getDBMLSuggestions('Tab', 3, tables)[0]?.label).toBe('Table');
    expect(getDBMLSuggestions(typeSource, typeSource.length, tables).map(item => item.label)).toContain('INT');
    expect(getDBMLSuggestions(settingSource, settingSource.length, tables)[0]?.label).toBe('pk');
    expect(getDBMLSuggestions(tableSource, tableSource.length, tables)[0]?.label).toBe('users');

    const source = 'Ref: posts.user_id > users.i';
    const column = getDBMLSuggestions(source, source.length, tables)[0];
    expect(column).toMatchObject({ label: 'id', from: source.length - 1, to: source.length });
  });
});
