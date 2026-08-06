import { describe, expect, it } from 'vitest';
import { DBML_REFERENCE } from '../DBMLReferenceDialog';
import { dbmlToERD } from '@/lib/dbml-converter';

describe('DBML reference', () => {
  it('stays valid for the editor parser', () => {
    const result = dbmlToERD(DBML_REFERENCE);

    expect(result.nodes.map(node => node.data.name)).toEqual(['users', 'posts']);
    expect(result.edges).toHaveLength(1);
    expect(result.nodes.find(node => node.data.name === 'users')?.data.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'users_email_unique', is_unique: true }),
      ]),
    );
  });
});
