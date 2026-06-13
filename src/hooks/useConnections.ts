import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type DbType = 'postgresql' | 'mysql' | 'sqlite';

export interface Connection {
  id: number;
  name: string;
  type: DbType;
  host?: string;
  port?: number;
  user?: string;
  database: string;
  is_test_ok?: boolean;
  last_tested_at?: string;
  created_at: string;
}

export interface ConnectionFormData {
  name: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface TestResult {
  success: boolean;
  message: string;
}

const DEFAULT_PORTS: Record<DbType, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: 0,
};

export function useConnections() {
  const { user, isGuest } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isDesktop = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  const fetchConnections = useCallback(async () => {
    if (!user || isGuest || !isDesktop) return;
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connections');
      if (!res.ok) throw new Error('Failed to load connections');
      const data: Connection[] = await res.json();
      setConnections(data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load database connections');
    } finally {
      setIsLoading(false);
    }
  }, [user, isGuest, isDesktop]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const testConnection = async (info: ConnectionFormData): Promise<TestResult> => {
    try {
      const res = await apiFetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, message: data.error || data.message || 'Connection failed' };
      }
      return { success: true, message: data.message || 'Connection successful' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to test connection' };
    }
  };

  const testExistingConnection = async (id: number): Promise<TestResult> => {
    try {
      const res = await apiFetch(`/api/connections/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, message: data.error || data.message || 'Connection failed' };
      }
      return { success: true, message: data.message || 'Connection successful' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to test connection' };
    }
  };

  const createConnection = async (data: ConnectionFormData): Promise<Connection | null> => {
    try {
      const res = await apiFetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save connection');
      }
      const conn: Connection = await res.json();
      setConnections(prev => [...prev, conn]);
      toast.success('Connection saved');
      return conn;
    } catch (e: any) {
      toast.error(e.message || 'Gagal simpan koneksi');
      return null;
    }
  };

  const updateConnection = async (id: number, data: ConnectionFormData): Promise<Connection | null> => {
    try {
      const res = await apiFetch(`/api/connections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal update koneksi');
      }
      const conn: Connection = await res.json();
      setConnections(prev => prev.map(c => c.id === id ? conn : c));
      toast.success('Connection updated');
      return conn;
    } catch (e: any) {
      toast.error(e.message || 'Failed to update connection');
      return null;
    }
  };

  const deleteConnection = async (id: number) => {
    try {
      const res = await apiFetch(`/api/connections/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete connection');
      setConnections(prev => prev.filter(c => c.id !== id));
      toast.success('Connection deleted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete connection');
    }
  };

  const importAsDiagram = async (id: number, name: string): Promise<{ diagram: any; table_count: number } | null> => {
    try {
      const res = await apiFetch(`/api/connections/${id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to import schema');
      }
      const result = await res.json();
      toast.success(`Imported ${result.table_count} tables as "${name}"`);
      return result;
    } catch (e: any) {
      toast.error(e.message || 'Failed to import schema');
      return null;
    }
  };

  const getDefaultPort = (type: DbType) => DEFAULT_PORTS[type];

  return {
    connections,
    isLoading,
    fetchConnections,
    testConnection,
    testExistingConnection,
    createConnection,
    updateConnection,
    deleteConnection,
    importAsDiagram,
    getDefaultPort,
  };
}
