import { beforeAll, describe, expect, it } from 'vitest';
import { DBML_REFERENCE } from '../DBMLReferenceDialog';
import { dbmlToERD } from '@/lib/dbml-converter';
import { loadDbmlCore } from '@/lib/dbml-core';

// The parser is ~15 MB; loading it in parallel test workers can exceed the 10 s hook default.
beforeAll(() => loadDbmlCore(), 60_000);

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
