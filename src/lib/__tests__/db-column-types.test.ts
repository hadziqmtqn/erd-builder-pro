import { describe, expect, it } from 'vitest';
import { columnTypeOption, columnTypeWithModifiers } from '../../../shared/db-column-types';

describe('database column types', () => {
  it('normalizes driver metadata and preserves valid modifiers', () => {
    expect(columnTypeOption('postgresql', 'timestamp(3) without time zone')).toBe('TIMESTAMP');
    expect(columnTypeOption('postgresql', 'timestamp(6) with time zone')).toBe('TIMESTAMPTZ');
    expect(columnTypeOption('postgresql', 'character varying(255)')).toBe('VARCHAR');
    expect(columnTypeOption('mysql', 'int unsigned')).toBe('INT UNSIGNED');
    expect(columnTypeOption('mysql', 'double precision')).toBe('DOUBLE');
    expect(columnTypeWithModifiers('postgresql', 'timestamp(3) without time zone', '', '3', '')).toBe('TIMESTAMP(3)');
    expect(columnTypeWithModifiers('mysql', 'timestamp(3)', '', '3', '')).toBe('TIMESTAMP(3)');
  });
});
