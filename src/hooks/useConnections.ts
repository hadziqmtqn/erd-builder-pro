import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type DbType = 'postgresql' | 'mysql' | 'sqlite';
export type DbEnvironment = 'local' | 'development' | 'staging' | 'production';
export type DbSafeMode = 'normal' | 'protected' | 'read-only';
export type DbSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

// ── Old-style Connection (flat: account + db in one) ──
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

// ── New: DbAccount (server-level credentials) ──
export interface DbAccount {
  id: number;
  name: string;
  type: DbType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  environment: DbEnvironment;
  safeMode: DbSafeMode;
  sslMode: DbSslMode;
  sslCa?: string;
  sslCert?: string;
  sslKey?: string;
  queryTimeoutMs: number;
  _count?: { catalogs: number };
  createdAt: string;
  updatedAt: string;
}

export interface DbAccountFormData {
  name: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  erdName?: string;
  projectId?: string;
  environment: DbEnvironment;
  safeMode: DbSafeMode;
  sslMode: DbSslMode;
  sslCa?: string;
  sslCert?: string;
  sslKey?: string;
  queryTimeoutMs: number;
}

// ── New: DbCatalog (a specific database on a server) ──
export interface DbCatalog {
  id: number;
  accountId: number;
  databaseName: string;
  label: string;
  account?: {
    id: number;
    name: string;
    type: DbType;
    host?: string;
    port?: number;
  };
  createdAt: string;
}

export interface DatabaseEntry {
  name: string;
  isConnected: boolean;
}

const DEFAULT_PORTS: Record<DbType, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: 0,
};

// ══════════════════════════════════════════
// Old hook (backward compat — wraps catalogs as flat connections)
// ══════════════════════════════════════════
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
      toast.success(`Imported ${result.tableCount} tables as "${name}"`);
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

// ══════════════════════════════════════════
// New hooks: useDbAccounts + useDbCatalogs
// ══════════════════════════════════════════

export function useDbAccounts() {
  const { user, isGuest } = useAuth();
  const [accounts, setAccounts] = useState<DbAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isDesktop = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  const fetchAccounts = useCallback(async () => {
    if (!user || isGuest || !isDesktop) return;
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to load accounts');
      const data: DbAccount[] = await res.json();
      setAccounts(data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load database accounts');
    } finally {
      setIsLoading(false);
    }
  }, [user, isGuest, isDesktop]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = async (data: DbAccountFormData): Promise<DbAccount | null> => {
    try {
      const res = await apiFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save account');
      }
      const account: DbAccount = await res.json();
      setAccounts(prev => [account, ...prev]);
      toast.success('Server account saved');
      return account;
    } catch (e: any) {
      toast.error(e.message || 'Failed to save account');
      return null;
    }
  };

  const updateAccount = async (id: number, data: DbAccountFormData): Promise<DbAccount | null> => {
    try {
      const res = await apiFetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update account');
      }
      const account: DbAccount = await res.json();
      setAccounts(prev => prev.map(a => a.id === id ? account : a));
      toast.success('Account updated');
      return account;
    } catch (e: any) {
      toast.error(e.message || 'Failed to update account');
      return null;
    }
  };

  const deleteAccount = async (id: number) => {
    try {
      const res = await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      setAccounts(prev => prev.filter(a => a.id !== id));
      toast.success('Account deleted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete account');
    }
  };

  const listDatabases = async (id: number): Promise<DatabaseEntry[]> => {
    try {
      const res = await apiFetch(`/api/accounts/${id}/databases`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to list databases');
      }
      const data = await res.json();
      return data.databases || [];
    } catch (e: any) {
      toast.error(e.message || 'Failed to list databases');
      return [];
    }
  };

  const createDatabase = async (id: number, name: string): Promise<DatabaseEntry | null> => {
    try {
      const res = await apiFetch(`/api/accounts/${id}/databases/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create database');
      }
      const database: DatabaseEntry = await res.json();
      toast.success(`Database "${database.name}" created`);
      return database;
    } catch (e: any) {
      toast.error(e.message || 'Failed to create database');
      return null;
    }
  };

  const testAccount = async (id: number): Promise<TestResult> => {
    try {
      const res = await apiFetch(`/api/accounts/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, message: data.error || data.message || 'Connection failed' };
      }
      return { success: true, message: data.message || 'Connection successful' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to test connection' };
    }
  };

  const getDefaultPort = (type: DbType) => DEFAULT_PORTS[type];

  return {
    accounts,
    isLoading,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    listDatabases,
    createDatabase,
    testAccount,
    getDefaultPort,
  };
}

export function useDbCatalogs(accountId?: number) {
  const { user, isGuest } = useAuth();
  const [catalogs, setCatalogs] = useState<DbCatalog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isDesktop = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  const fetchCatalogs = useCallback(async () => {
    // Skip fetch in web mode — DB Connect is desktop-only
    if (!isDesktop || !user || isGuest) return;
    setIsLoading(true);
    try {
      const params = accountId ? `?accountId=${accountId}` : '';
      const res = await apiFetch(`/api/catalogs${params}`);
      if (!res.ok) throw new Error('Failed to load catalog');
      const data: DbCatalog[] = await res.json();
      setCatalogs(data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load database catalogs');
    } finally {
      setIsLoading(false);
    }
  }, [user, isGuest, isDesktop, accountId]);

  useEffect(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  const createCatalog = async (acctId: number, databaseName: string, label?: string): Promise<DbCatalog | null> => {
    try {
      const res = await apiFetch('/api/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: acctId, databaseName, label }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create catalog');
      }
      const catalog: DbCatalog = await res.json();
      setCatalogs(prev => [catalog, ...prev]);
      toast.success(`Database "${databaseName}" connected`);
      return catalog;
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect database');
      return null;
    }
  };

  const deleteCatalog = async (id: number): Promise<{ detachedDiagrams: number; deletedDiagrams?: number; diagramNames: string[] } | null> => {
    try {
      const res = await apiFetch(`/api/catalogs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete catalog');
      const result = await res.json();
      setCatalogs(prev => prev.filter(c => c.id !== id));
      toast.success('Database disconnected');
      return result as { detachedDiagrams: number; deletedDiagrams?: number; diagramNames: string[] };
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect database');
      return null;
    }
  };

  const importAsDiagram = async (catalogId: number, name: string, projectId?: number | string | null): Promise<{ diagram: any; tableCount: number } | null> => {
    try {
      const res = await apiFetch(`/api/catalogs/${catalogId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, project_id: projectId ?? null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to import schema');
      }
      const result = await res.json();
      toast.success(`Imported ${result.tableCount} tables as "${name}"`);
      return result;
    } catch (e: any) {
      toast.error(e.message || 'Failed to import schema');
      return null;
    }
  };

  const migrateOldConnections = async (): Promise<number> => {
    try {
      const res = await apiFetch('/api/migrate-connections', { method: 'POST' });
      if (!res.ok) throw new Error('Migration failed');
      const data = await res.json();
      if (data.migrated > 0) {
        toast.success(`Migrated ${data.migrated} old connections`);
        fetchCatalogs();
      }
      return data.migrated || 0;
    } catch (e: any) {
      toast.error('Migration failed: ' + e.message);
      return 0;
    }
  };

  return {
    catalogs,
    isLoading,
    fetchCatalogs,
    createCatalog,
    deleteCatalog,
    importAsDiagram,
    migrateOldConnections,
  };
}
