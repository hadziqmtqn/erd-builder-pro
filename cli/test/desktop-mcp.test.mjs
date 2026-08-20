import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  desktopDataDir,
  desktopMcpCandidates,
  desktopMcpRuntimeCandidates,
  resolveDesktopMcpRuntime,
  resolveDesktopMcpTarget,
} from '../src/desktop-mcp.mjs';

test('resolves an explicit Desktop MCP target before platform defaults', () => {
  const target = '/tmp/ERD Builder Pro';
  assert.deepEqual(desktopMcpCandidates({ env: { ERDBPRO_DESKTOP_MCP_TARGET: target } }), [target]);
  assert.equal(resolveDesktopMcpTarget({
    env: { ERDBPRO_DESKTOP_MCP_TARGET: target },
    exists: candidate => candidate === target,
  }), target);
});

test('checks Linux package, local, and AppImage locations', () => {
  assert.deepEqual(desktopMcpCandidates({ platform: 'linux', env: {}, home: '/home/user' }), [
    '/usr/bin/ERD Builder Pro',
    '/usr/local/bin/ERD Builder Pro',
    '/home/user/.local/bin/ERD Builder Pro',
    '/usr/bin/erd-builder-pro',
    '/usr/local/bin/erd-builder-pro',
    '/home/user/.local/bin/erd-builder-pro',
    '/opt/ERD Builder Pro/ERD Builder Pro',
    '/opt/ERD Builder Pro/erd-builder-pro',
    '/opt/erd-builder-pro/erd-builder-pro',
    '/home/user/Applications/ERD-Builder-Pro.AppImage',
    '/home/user/Applications/ERD Builder Pro.AppImage',
  ]);
});

test('runs the packaged macOS MCP backend without launching the app binary', () => {
  const executable = '/Applications/ERD Builder Pro.app/Contents/MacOS/ERD Builder Pro';
  const [runtime] = desktopMcpRuntimeCandidates(executable, 'darwin');
  assert.deepEqual(runtime, {
    node: '/Applications/ERD Builder Pro.app/Contents/Resources/dist-server/node-bin/node',
    script: '/Applications/ERD Builder Pro.app/Contents/Resources/dist-server/mcp.js',
  });
  assert.deepEqual(resolveDesktopMcpRuntime(executable, {
    platform: 'darwin',
    exists: candidate => candidate === runtime.node || candidate === runtime.script,
  }), runtime);
  assert.equal(desktopDataDir({ platform: 'darwin', home: '/Users/tester' }), '/Users/tester/Library/Application Support/com.erdbuilderpro.app');
});

test('exposes the Desktop MCP flag on the CLI command', () => {
  const result = spawnSync(process.execPath, ['cli/bin/erdbpro.js', 'mcp', '--help'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--desktop/);
});
