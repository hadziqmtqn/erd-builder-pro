import { describe, expect, it } from 'vitest';
import { reconcileLiveTab, sqlToRun, type QueryTab } from './data-query-state';

describe('sqlToRun', () => {
  it('prefers a selection and otherwise resolves the statement at the cursor', () => {
    const sql = 'SELECT 1;\nSELECT * FROM users;';
    expect(sqlToRun(sql, 5, 5)).toBe('SELECT 1');
    expect(sqlToRun(sql, 20, 20)).toBe('SELECT * FROM users');
    expect(sqlToRun(sql, 0, 8)).toBe('SELECT 1');
    expect(sqlToRun(sql, sql.length, sql.length)).toBe('SELECT * FROM users');
  });

  it('keeps the live script during delayed tab-state updates', () => {
    const tab = (key: string, script: string) => ({ key, script, id: null, groupName: '', name: '', result: null, resultPage: 1, error: null } as QueryTab);
    expect(reconcileLiveTab(tab('a', 'SELECT j'), tab('a', 'SELECT jurusans'))?.script).toBe('SELECT jurusans');
    expect(reconcileLiveTab(tab('b', 'SELECT baru'), tab('a', 'SELECT lama'))?.script).toBe('SELECT baru');
  });
});
