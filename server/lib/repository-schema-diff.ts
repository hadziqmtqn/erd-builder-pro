import { computeSchemaDiff } from '../../src/lib/schema-diff.js';
import { parseRepositorySchema } from '../../src/lib/repository-schema.js';
import { inspectRepository, readRepositorySource, RepositoryError, type RepositorySource } from './repository-git.js';

export type RepositorySchemaDiffOptions = {
  repositoryPath: string;
  baseRef: string;
  headRef: string;
  sourceId?: string;
};

type Change = { kind: 'table' | 'column' | 'relation'; state: 'new' | 'modified' | 'deleted'; label: string };

function selectSource(base: RepositorySource[], head: RepositorySource[], sourceId?: string) {
  const headIds = new Set(head.map(source => source.id));
  const shared = base.filter(source => headIds.has(source.id));
  const source = sourceId ? shared.find(item => item.id === sourceId) : shared.length === 1 ? shared[0] : null;
  if (source) return source;
  if (sourceId) throw new RepositoryError(`Schema source must exist at both refs: ${sourceId}`);
  throw new RepositoryError(`Choose a shared schema source with --source: ${shared.map(item => item.id).join(', ') || 'none found'}`);
}

export async function diffRepositorySchema({ repositoryPath, baseRef, headRef, sourceId }: RepositorySchemaDiffOptions) {
  const [baseInspection, headInspection] = await Promise.all([
    inspectRepository(repositoryPath, baseRef),
    inspectRepository(repositoryPath, headRef),
  ]);
  const source = selectSource(baseInspection.sources, headInspection.sources, sourceId);
  const [baseSnapshot, headSnapshot] = await Promise.all([
    readRepositorySource(baseInspection.root, baseRef, source.id),
    readRepositorySource(headInspection.root, headRef, source.id),
  ]);
  const base = parseRepositorySchema(source.kind, baseSnapshot.files);
  const head = parseRepositorySchema(source.kind, headSnapshot.files);
  const diff = computeSchemaDiff(base.nodes, base.edges, head.nodes, head.edges);
  const changes: Change[] = diff.changes.map(change => ({ kind: change.kind, state: change.state, label: change.label }));
  const destructive = changes.filter(change => change.state === 'deleted');

  return {
    repository: baseInspection.root,
    source: { id: source.id, kind: source.kind, path: source.path },
    base: { ref: baseRef, commit: baseSnapshot.commit, tables: base.nodes.length, relations: base.edges.length },
    head: { ref: headRef, commit: headSnapshot.commit, tables: head.nodes.length, relations: head.edges.length },
    changes,
    summary: { added: diff.newCount, modified: diff.modifiedCount, deleted: diff.deletedCount },
    destructive,
    warnings: [...new Set([...base.warnings, ...head.warnings])],
  };
}
