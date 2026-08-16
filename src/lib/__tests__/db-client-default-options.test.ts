import { describe, expect, it } from 'vitest';
import {
  columnDefaultOptions,
  CUSTOM_COLUMN_DEFAULT,
  editableTextColumnDefault,
  NO_COLUMN_DEFAULT,
  serializeColumnDefault,
} from '../db-client-default-options';

describe('columnDefaultOptions', () => {
  it('limits defaults by column type while preserving an existing value', () => {
    expect(columnDefaultOptions('TIMESTAMPTZ', true, 'now()')).toEqual([
      { value: NO_COLUMN_DEFAULT, label: 'No default' },
      { value: 'NULL', label: 'NULL' },
      { value: 'CURRENT_TIMESTAMP', label: 'CURRENT_TIMESTAMP' },
      { value: 'now()', label: 'now() (current)' },
    ]);
    expect(columnDefaultOptions('VARCHAR(255)', false)).toEqual([
      { value: NO_COLUMN_DEFAULT, label: 'No default' },
      { value: CUSTOM_COLUMN_DEFAULT, label: 'Custom value…' },
    ]);
    expect(editableTextColumnDefault("'member'::text")).toBe('member');
    expect(serializeColumnDefault('TEXT', "O'Reilly")).toBe("'O''Reilly'");
  });
});
