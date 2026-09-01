import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffRepositorySchema } from './repository-schema-diff';

describe('repository schema diff', () => {
  it('compares two commits without changing the checked-out ref', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'erdbpro-schema-diff-'));
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
    writeFileSync(path.join(root, 'schema.dbml'), 'Table users {\n  id integer [pk]\n  email varchar\n}\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-qm', 'base']);
    const base = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeFileSync(path.join(root, 'schema.dbml'), 'Table users {\n  id integer [pk]\n}\n\nTable posts {\n  id integer [pk]\n}\n');
    execFileSync('git', ['-C', root, 'commit', '-am', 'head', '-q']);
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

    const result = await diffRepositorySchema({ repositoryPath: root, baseRef: base, headRef: head });

    expect(result.summary).toMatchObject({ added: 1, deleted: 1 });
    expect(result.destructive).toContainEqual({ kind: 'column', state: 'deleted', label: 'users.email' });
    expect(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(head);
  });
});
