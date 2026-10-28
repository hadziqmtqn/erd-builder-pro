import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { apiFetch, isInstalledApp } from '@/lib/api';
import { FILE_TYPES, type FileTypeKey } from '@/lib/file-types';
import { localPersistence } from '@/lib/localPersistence';

export type ProjectFileRow = Record<string, any> & { type: FileTypeKey };
export type FileCounts = Record<FileTypeKey, number>;

export interface ProjectFilePage {
  data: ProjectFileRow[];
  total: number;
  counts: FileCounts;
  /** Types the active Cloud Team plan does not include; their files are not listed. */
  locked: FileTypeKey[];
}

const EMPTY_PAGE: ProjectFilePage = {
  data: [],
  total: 0,
  counts: { notes: 0, erd: 0, flowchart: 0, 'db-client': 0, drawings: 0 },
  locked: [],
};

export interface ProjectFileQuery {
  /** Numeric Project id, or "null" for files without a Project. */
  projectId: string | null;
  type: FileTypeKey | 'all';
  page: number;
  perPage: number;
  q?: string;
}

/** Guest files live in the browser, so the guest page is built from local storage the same way the server does. */
async function loadGuestPage({ projectId, type, page, perPage, q }: ProjectFileQuery): Promise<ProjectFilePage> {
  const counts = { ...EMPTY_PAGE.counts };
  const rows: ProjectFileRow[] = [];
  const needle = q?.trim().toLowerCase();
  for (const { value } of FILE_TYPES) {
    if (value === 'db-client') continue;
    const files = (await localPersistence.getAllResources(value)).filter((file: any) =>
      !file.is_deleted
      && String(file.project_id ?? 'null') === projectId
      && (!needle || String(file.title ?? file.name ?? '').toLowerCase().includes(needle)));
    counts[value] = files.length;
    if (type === 'all' || type === value) rows.push(...files.map((file: any) => ({ ...file, type: value })));
  }
  rows.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  return {
    data: rows.slice((page - 1) * perPage, page * perPage),
    total: type === 'all' ? Object.values(counts).reduce((sum, count) => sum + count, 0) : counts[type],
    counts,
    locked: [],
  };
}

/** One page of a Project's files plus per-type counts (COL-008). */
export function useProjectFilePage(query: ProjectFileQuery, refreshKey?: unknown) {
  const { isGuest } = useAuth();
  const [result, setResult] = useState<ProjectFilePage>(EMPTY_PAGE);
  const [isLoading, setIsLoading] = useState(false);
  const { projectId, type, page, perPage, q = '' } = query;

  useEffect(() => {
    if (!projectId) {
      setResult(EMPTY_PAGE);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const load = async (): Promise<ProjectFilePage> => {
      if (isGuest) return loadGuestPage({ projectId, type, page, perPage, q });
      const params = new URLSearchParams({
        project_id: projectId,
        type,
        limit: String(perPage),
        offset: String((page - 1) * perPage),
        include_db_client: String(isInstalledApp()),
      });
      if (q.trim()) params.set('q', q.trim());
      const response = await apiFetch(`/api/projects/files?${params}`);
      if (!response.ok) throw new Error('Failed to load project files');
      const body = await response.json();
      return { ...EMPTY_PAGE, ...body, counts: { ...EMPTY_PAGE.counts, ...body.counts }, locked: body.locked ?? [] };
    };
    load()
      .then((next) => { if (!cancelled) setResult(next); })
      .catch(() => { if (!cancelled) setResult(EMPTY_PAGE); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, type, page, perPage, q, isGuest, refreshKey]);

  return { ...result, isLoading };
}
