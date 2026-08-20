import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export function useDbClients() {
  const [dbClients, setDbClients] = useState<any[]>([]);
  const [dbClientsTotal, setDbClientsTotal] = useState(0);
  const [isDbClientsLoading, setIsDbClientsLoading] = useState(false);

  const fetchDbClients = useCallback(async ({ projectId, query = '', page = 1 }: {
    projectId?: string | number | null;
    query?: string;
    page?: number;
  } = {}) => {
    setIsDbClientsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '10', offset: String((page - 1) * 10) });
      if (projectId !== null && projectId !== undefined && projectId !== 'all') params.set('project_id', String(projectId));
      if (query.trim()) params.set('q', query.trim());
      const response = await apiFetch(`/api/db-clients?${params}`);
      if (!response.ok) throw new Error('Failed to load DB Clients');
      const body = await response.json();
      setDbClients(Array.isArray(body.data) ? body.data : []);
      setDbClientsTotal(Number(body.total) || 0);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load DB Clients');
    } finally {
      setIsDbClientsLoading(false);
    }
  }, []);

  const deleteDbClient = useCallback(async (uid: string) => {
    const response = await apiFetch(`/api/db-clients/${encodeURIComponent(uid)}`, { method: 'DELETE' });
    if (!response.ok) {
      toast.error('Failed to move DB Client to trash');
      return false;
    }
    setDbClients(items => items.filter(item => String(item.uid ?? item.id) !== String(uid)));
    setDbClientsTotal(total => Math.max(0, total - 1));
    toast.success('DB Client moved to trash');
    return true;
  }, []);

  return { dbClients, dbClientsTotal, isDbClientsLoading, fetchDbClients, deleteDbClient };
}
