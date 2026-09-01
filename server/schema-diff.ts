#!/usr/bin/env node
import { diffRepositorySchema } from './lib/repository-schema-diff.js';

const args = process.argv.slice(2);
const option = (name: string, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const json = args.includes('--json');
const markdown = args.includes('--markdown');
const failOnDestructive = args.includes('--fail-on-destructive');

function report(result: Awaited<ReturnType<typeof diffRepositorySchema>>) {
  if (json) return JSON.stringify(result, null, 2);
  if (markdown) {
    const rows = result.changes.slice(0, 100).map(change => `| ${change.state} | ${change.kind} | ${change.label.replaceAll('|', '\\|')} |`);
    return [
      '## ERD Builder Pro schema drift',
      '',
      `\`${result.source.id}\` — ${result.base.ref} → ${result.head.ref}`,
      '',
      `**${result.summary.added} added**, **${result.summary.modified} modified**, **${result.summary.deleted} deleted**`,
      ...(rows.length ? ['', '| Change | Kind | Item |', '| --- | --- | --- |', ...rows] : ['', 'No schema changes detected.']),
      ...(result.changes.length > rows.length ? ['', `Showing first ${rows.length} of ${result.changes.length} changes.`] : []),
      ...(result.warnings.length ? ['', `Warnings: ${result.warnings.join('; ')}`] : []),
    ].join('\n');
  }
  return [
    `✓ ${result.summary.added} added, ${result.summary.modified} modified, ${result.summary.deleted} deleted`,
    `  ${result.source.id} @ ${result.base.ref} → ${result.head.ref}`,
    ...result.changes.map(change => `  ${change.state} ${change.kind}: ${change.label}`),
    ...result.warnings.map(warning => `⚠ ${warning}`),
  ].join('\n');
}

try {
  const baseRef = option('--base');
  if (!baseRef) throw new Error('--base is required');
  const result = await diffRepositorySchema({
    repositoryPath: option('--repo', process.cwd()),
    baseRef,
    headRef: option('--head', 'WORKTREE'),
    sourceId: option('--source') || undefined,
  });
  console.log(report(result));
  if (failOnDestructive && result.destructive.length) process.exitCode = 2;
} catch (error: any) {
  const message = error?.message || 'Schema diff failed';
  console.error(json ? JSON.stringify({ error: message }, null, 2) : `✗ ${message}`);
  process.exitCode = 1;
}
