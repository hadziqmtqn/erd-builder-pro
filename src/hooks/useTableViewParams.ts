import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_FEATURES = ['erd', 'notes', 'drawings', 'flowchart'] as const;
type Feature = typeof VALID_FEATURES[number];

export interface TableViewParams {
  view: 'table' | null;
  feature: Feature | null;
  page: number;
  workspace: string | null; // UUID
  setParams: (updates: Partial<Omit<TableViewParams, 'setParams'>>) => void;
}

function validateFeature(v: string | null): Feature | null {
  if (!v) return null;
  const lower = v.toLowerCase();
  return (VALID_FEATURES as readonly string[]).includes(lower) ? lower as Feature : null;
}

function validatePage(v: string | null): number {
  if (!v) return 1;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    toast.error('Invalid page number. Using page 1.');
    return 1;
  }
  return n;
}

function validateWorkspace(v: string | null): string | null {
  if (!v) return null;
  if (!UUID_RE.test(v)) {
    toast.error('Invalid workspace UID format.');
    return null;
  }
  return v;
}

export function useTableViewParams(): TableViewParams {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const view = searchParams.get('view');
    const feature = validateFeature(searchParams.get('feature'));
    const page = validatePage(searchParams.get('page'));
    const workspace = validateWorkspace(searchParams.get('workspace'));

    if (view !== null && view !== 'table') {
      toast.error('Invalid view parameter. Expected "table".');
    }

    return {
      view: view === 'table' ? 'table' as const : null,
      feature,
      page,
      workspace,
    };
  }, [searchParams]);

  const setParams = useCallback((updates: Partial<Omit<TableViewParams, 'setParams'>>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);

      if (updates.view !== undefined) {
        if (updates.view) next.set('view', 'table');
        else next.delete('view');
      }
      if (updates.feature !== undefined) {
        if (updates.feature) next.set('feature', updates.feature);
        else next.delete('feature');
      }
      if (updates.page !== undefined) {
        if (updates.page > 1) next.set('page', String(updates.page));
        else next.delete('page');
      }
      if (updates.workspace !== undefined) {
        if (updates.workspace) next.set('workspace', updates.workspace);
        else next.delete('workspace');
      }

      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return { ...params, setParams };
}

export type { Feature };
