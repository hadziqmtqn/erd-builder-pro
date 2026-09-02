import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRepositorySchema } from './schema-check';

describe('repository schema check', () => {
  it('validates one source and requires an explicit choice for multiple sources', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'erdbpro-schema-check-'));
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
    writeFileSync(path.join(root, 'schema.dbml'), 'Table users {\n  id integer [pk]\n}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-qm', 'schema']);

    await expect(checkRepositorySchema({ repositoryPath: root })).resolves.toMatchObject({ tables: 1, relations: 0, source: { id: 'dbml:schema.dbml' } });

    writeFileSync(path.join(root, 'other.dbml'), 'Table posts {\n  id integer [pk]\n}\n');
    await expect(checkRepositorySchema({ repositoryPath: root })).rejects.toThrow('Multiple schema sources found');
    await expect(checkRepositorySchema({ repositoryPath: root, sourceId: 'dbml:other.dbml' })).resolves.toMatchObject({ tables: 1 });
  });
});
