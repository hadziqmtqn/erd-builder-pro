import { inspectRepository, readRepositorySource, RepositoryError } from './repository-git.js';
import { parseRepositorySchema } from '../../src/lib/repository-schema.js';

export type SchemaCheckOptions = {
  repositoryPath: string;
  ref?: string;
  sourceId?: string;
};

export async function checkRepositorySchema({ repositoryPath, ref = 'WORKTREE', sourceId }: SchemaCheckOptions) {
  const inspection = await inspectRepository(repositoryPath, ref);
  if (!inspection.sources.length) throw new RepositoryError('No supported schema source was found');

  const source = sourceId
    ? inspection.sources.find(item => item.id === sourceId)
    : inspection.sources.length === 1 ? inspection.sources[0] : null;
  if (!source) {
    const available = inspection.sources.map(item => item.id).join(', ');
    throw new RepositoryError(sourceId ? `Schema source not found: ${sourceId}` : `Multiple schema sources found; choose one with --source: ${available}`);
  }

  const snapshot = await readRepositorySource(inspection.root, ref, source.id);
  const parsed = parseRepositorySchema(source.kind, snapshot.files);
  if (!parsed.nodes.length) throw new RepositoryError('Schema source did not produce any tables');

  return {
    repository: inspection.root,
    ref,
    commit: snapshot.commit,
    source: { id: source.id, kind: source.kind, path: source.path, files: source.fileCount },
    tables: parsed.nodes.length,
    relations: parsed.edges.length,
    warnings: parsed.warnings,
  };
}
