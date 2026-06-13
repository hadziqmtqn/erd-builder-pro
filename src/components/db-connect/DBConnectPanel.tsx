import React, { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Plus, Database, Search, Loader2, HardDrive } from 'lucide-react';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionForm } from './ConnectionForm';
import {
  useDbAccounts,
  useDbCatalogs,
  type DbAccount,
  type DbCatalog,
  type DbAccountFormData,
  type DatabaseEntry,
} from '@/hooks/useConnections';
import { toast } from 'sonner';

interface DBConnectPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (diagramUid: string) => void;
}

export function DBConnectPanel({
  open,
  onOpenChange,
  onImportComplete,
}: DBConnectPanelProps) {
  const {
    accounts,
    isLoading,
    createAccount,
    updateAccount,
    deleteAccount,
    listDatabases,
    testAccount,
    getDefaultPort,
    fetchAccounts,
  } = useDbAccounts();

  const {
    catalogs,
    fetchCatalogs,
    createCatalog,
    deleteCatalog,
    importAsDiagram,
  } = useDbCatalogs();

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAcc, setEditingAcc] = useState<DbAccount | null>(null);
  const [deletingAcc, setDeletingAcc] = useState<DbAccount | null>(null);
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());

  // Add database flow
  const [addDbAccount, setAddDbAccount] = useState<DbAccount | null>(null);
  const [availableDbs, setAvailableDbs] = useState<DatabaseEntry[]>([]);
  const [isLoadingDbs, setIsLoadingDbs] = useState(false);

  // Import flow
  const [importCat, setImportCat] = useState<DbCatalog | null>(null);
  const [importName, setImportName] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const filtered = search.trim()
    ? accounts.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.type.toLowerCase().includes(search.toLowerCase()) ||
        a.host?.toLowerCase().includes(search.toLowerCase())
      )
    : accounts;

  const handleAdd = () => {
    setEditingAcc(null);
    setShowForm(true);
  };

  const handleEdit = (acc: DbAccount) => {
    setEditingAcc(acc);
    setShowForm(true);
  };

  const handleSave = async (data: DbAccountFormData): Promise<DbAccount | null> => {
    if (editingAcc) {
      return updateAccount(editingAcc.id, data);
    }
    return createAccount(data);
  };

  const handleTest = async (data: DbAccountFormData) => {
    try {
      const { apiFetch } = await import('@/lib/api');
      const res = await apiFetch('/api/accounts/test-cred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        return { success: false, message: result.error || result.message || 'Connection failed' };
      }
      return { success: true, message: result.message || 'Connection successful' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Failed to test connection' };
    }
  };

  const handleTestExisting = async (acc: DbAccount) => {
    setTestingIds(prev => new Set(prev).add(acc.id));
    const result = await testAccount(acc.id);
    setTestingIds(prev => {
      const next = new Set(prev);
      next.delete(acc.id);
      return next;
    });
    if (result.success) {
      toast.success(result.message);
      fetchAccounts();
    } else {
      toast.error(result.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingAcc) return;
    await deleteAccount(deletingAcc.id);
    setDeletingAcc(null);
  };

  const handleAddDatabase = async (acc: DbAccount) => {
    setIsLoadingDbs(true);
    setAddDbAccount(acc);
    setAvailableDbs([]);
    const dbs = await listDatabases(acc.id);
    setAvailableDbs(dbs);
    setIsLoadingDbs(false);
  };

  const handleSelectDatabase = async (dbName: string) => {
    if (!addDbAccount) return;
    const catalog = await createCatalog(addDbAccount.id, dbName);
    if (catalog) {
      setAddDbAccount(null);
      fetchCatalogs();
      fetchAccounts();
    }
  };

  const handleStartImport = (cat: DbCatalog) => {
    setImportName(cat.label || cat.databaseName);
    setImportCat(cat);
  };

  const handleImport = async () => {
    if (!importCat || !importName.trim()) return;
    setIsImporting(true);
    try {
      const result = await importAsDiagram(importCat.id, importName.trim());
      if (result?.diagram?.uid) {
        setImportCat(null);
        setImportName('');
        onOpenChange(false);
        onImportComplete?.(result.diagram.uid);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-md w-full p-0 flex flex-col gap-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle>Database Accounts</SheetTitle>
            <SheetDescription>
              Connect to external databases and import schemas as ERD diagrams
            </SheetDescription>
          </SheetHeader>

          {/* Search + Add */}
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Search accounts..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" className="h-9 shrink-0" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </div>

          {/* Account list */}
          <ScrollArea className="flex-1 px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2 pt-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-12 text-center">
                <HardDrive className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? 'No accounts found'
                    : 'No database accounts yet'}
                </p>
                {!search.trim() && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={handleAdd}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Account
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                {filtered.map(acc => (
                  <ConnectionCard
                    key={acc.id}
                    account={acc}
                    catalogs={catalogs.filter(c => c.accountId === acc.id)}
                    onEdit={handleEdit}
                    onDelete={setDeletingAcc}
                    onTest={handleTestExisting}
                    onAddCatalog={handleAddDatabase}
                    onImportCatalog={handleStartImport}
                    onDeleteCatalog={async (cat) => {
                      const result = await deleteCatalog(cat.id);
                      fetchCatalogs();
                      fetchAccounts();
                      if (result && result.detachedDiagrams > 0) {
                        toast.info(
                          `${result.detachedDiagrams} diagram(s) disconnected: ${result.diagramNames.join(', ')}`,
                          { duration: 5000 }
                        );
                      }
                    }}
                    isTesting={testingIds.has(acc.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Form dialog */}
      <ConnectionForm
        open={showForm}
        onOpenChange={setShowForm}
        editing={editingAcc}
        onSave={handleSave}
        onTest={handleTest}
        getDefaultPort={getDefaultPort}
      />

      {/* Delete account confirmation */}
      <AlertDialog open={deletingAcc !== null} onOpenChange={open => !open && setDeletingAcc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <p className="text-sm text-muted-foreground">
              Delete server account <strong>{deletingAcc?.name}</strong>?
              All connected databases ({catalogs.filter(c => c.accountId === deletingAcc?.id).length}) will be disconnected.
              Diagrams using these databases still exist, but can no longer sync.
            </p>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pick database dialog */}
      <AlertDialog open={addDbAccount !== null} onOpenChange={open => !open && setAddDbAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Database</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            {isLoadingDbs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableDbs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No databases found on <strong>{addDbAccount?.name}</strong>
              </p>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-1">
                  {availableDbs.map(db => (
                    <button
                      key={db.name}
                      className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left ${
                        db.isConnected
                          ? 'opacity-50 cursor-not-allowed bg-muted/30'
                          : 'hover:bg-accent transition-colors'
                      }`}
                      onClick={() => {
                        if (!db.isConnected) handleSelectDatabase(db.name);
                      }}
                    >
                      <Database className={`h-4 w-4 shrink-0 ${db.isConnected ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <span className="flex-1 truncate">{db.name}</span>
                      {db.isConnected && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Connected</span>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import as ERD name dialog */}
      <AlertDialog open={importCat !== null} onOpenChange={open => !open && setImportCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import as ERD Diagram</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <p className="text-sm text-muted-foreground mb-4">
              Create a new ERD diagram from <strong>{importCat?.label || importCat?.databaseName}</strong> tables.
            </p>
            <Input
              value={importName}
              onChange={e => setImportName(e.target.value)}
              placeholder="Diagram name"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && importName.trim() && !isImporting) {
                  handleImport();
                }
              }}
            />
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} disabled={!importName.trim() || isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
