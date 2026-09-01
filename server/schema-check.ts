#!/usr/bin/env node
import { checkRepositorySchema } from './lib/schema-check.js';

const args = process.argv.slice(2);
const option = (name: string, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const json = args.includes('--json');
const failOnWarnings = args.includes('--fail-on-warnings');

try {
  const result = await checkRepositorySchema({
    repositoryPath: option('--repo', process.cwd()),
    ref: option('--ref', 'WORKTREE'),
    sourceId: option('--source') || undefined,
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`✓ ${result.tables} tables, ${result.relations} relations`);
    console.log(`  ${result.source.id} @ ${result.commit.slice(0, 12)}`);
    for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
  }
  if (failOnWarnings && result.warnings.length) process.exitCode = 2;
} catch (error: any) {
  const message = error?.message || 'Schema check failed';
  if (json) console.log(JSON.stringify({ error: message }, null, 2));
  else console.error(`✗ ${message}`);
  process.exitCode = 1;
}
