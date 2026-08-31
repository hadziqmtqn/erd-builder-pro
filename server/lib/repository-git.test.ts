import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverRepositorySources, inspectRepository, readRepositorySource } from './repository-git';

describe('repository Git schema reader', () => {
  it('discovers supported sources and reads another commit without checkout', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'erdbpro-repository-'));
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
    writeFileSync(path.join(root, 'schema.dbml'), 'Table users { id integer [pk] }');
    mkdirSync(path.join(root, 'database', 'migrations'), { recursive: true });
    writeFileSync(path.join(root, 'database', 'migrations', '001_users.php'), '<?php');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-qm', 'initial']);
    const firstCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeFileSync(path.join(root, 'schema.dbml'), 'Table users { id integer [pk]\nemail varchar }');

    const inspected = await inspectRepository(root, 'WORKTREE');
    expect(inspected.sources.map(source => source.id)).toEqual(expect.arrayContaining(['dbml:schema.dbml', 'laravel:database/migrations']));
    const old = await readRepositorySource(root, firstCommit, 'dbml:schema.dbml');
    expect(old.files[0].content).not.toContain('email');
    expect(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(firstCommit);
  });

  it('groups SQL migration directories', () => {
    expect(discoverRepositorySources(['prisma/migrations/001/migration.sql', 'prisma/migrations/002/migration.sql'])).toContainEqual(expect.objectContaining({ id: 'sql:prisma/migrations', fileCount: 2 }));
  });
});
