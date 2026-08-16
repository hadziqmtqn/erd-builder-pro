import assert from 'node:assert/strict';
import test from 'node:test';
import { isNewerVersion, updateInstallCommand } from '../src/update.mjs';

test('compares release and prerelease versions safely', () => {
  assert.equal(isNewerVersion('3.4.0', '3.3.9'), true);
  assert.equal(isNewerVersion('3.3.3', '3.3.3'), false);
  assert.equal(isNewerVersion('3.3.2', '3.3.3'), false);
  assert.equal(isNewerVersion('3.3.3', '3.3.3-beta.2'), true);
  assert.equal(isNewerVersion('3.3.3-beta.3', '3.3.3-beta.2'), true);
  assert.equal(updateInstallCommand(), 'npm install -g erdbpro@latest --prefer-online');
});
