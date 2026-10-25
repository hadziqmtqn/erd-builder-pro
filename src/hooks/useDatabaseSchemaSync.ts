import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, getAuthToken } from '@/lib/api';

export function useDatabaseSchemaSync(connectionId: number | undefined, onSchema: (schema: any) => void) {
  const [isSyncing, setIsSyncing] = useState(false);
  const request = useRef<AbortController | null>(null);
  const owner = useRef(connectionId);
  const receive = useRef(onSchema);
  owner.current = connectionId;
  receive.current = onSchema;
  useEffect(() => {
    setIsSyncing(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [connectionId]);
  const sync = useCallback(async () => {
    if (!connectionId || request.current) return;
    const controller = new AbortController();
    const token = getAuthToken();
    request.current = controller;
    const current = () => request.current === controller && owner.current === connectionId && getAuthToken() === token && !controller.signal.aborted;
    setIsSyncing(true);
    try {
      const response = await apiFetch(`/api/catalogs/${connectionId}/schema`, { method: 'POST', signal: controller.signal });
      const data = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(data.error || 'Failed to sync schema');
      if (!Array.isArray(data.schema)) throw new Error('Invalid database schema response');
      // Only a review preview: the shared schema cache is updated when the merge is accepted.
      receive.current(data);
    } catch (error) {
      if (current()) toast.error(error instanceof Error ? error.message : 'Failed to sync schema');
    } finally {
      if (request.current === controller) { request.current = null; setIsSyncing(false); }
    }
  }, [connectionId]);
  return { sync, isSyncing };
}
