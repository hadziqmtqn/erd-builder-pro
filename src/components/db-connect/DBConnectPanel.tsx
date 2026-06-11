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
import { Plus, Database, Search, Loader2 } from 'lucide-react';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionForm } from './ConnectionForm';
import {
  useConnections,
  type Connection,
  type ConnectionFormData,
} from '@/hooks/useConnections';
import { toast } from 'sonner';

interface DBConnectPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConnection?: (conn: Connection) => void;
}

export function DBConnectPanel({
  open,
  onOpenChange,
  onSelectConnection,
}: DBConnectPanelProps) {
  const {
    connections,
    isLoading,
    testConnection,
    testExistingConnection,
    createConnection,
    updateConnection,
    deleteConnection,
    getDefaultPort,
    fetchConnections,
  } = useConnections();

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [deletingConn, setDeletingConn] = useState<Connection | null>(null);
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());

  const filtered = search.trim()
    ? connections.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.type.toLowerCase().includes(search.toLowerCase()) ||
        c.host?.toLowerCase().includes(search.toLowerCase())
      )
    : connections;

  const handleAdd = () => {
    setEditingConn(null);
    setShowForm(true);
  };

  const handleEdit = (conn: Connection) => {
    setEditingConn(conn);
    setShowForm(true);
  };

  const handleSave = async (data: ConnectionFormData): Promise<Connection | null> => {
    if (editingConn) {
      return updateConnection(editingConn.id, data);
    }
    return createConnection(data);
  };

  const handleTest = async (data: ConnectionFormData) => {
    return testConnection(data);
  };

  const handleTestExisting = async (conn: Connection) => {
    setTestingIds(prev => new Set(prev).add(conn.id));
    const result = await testExistingConnection(conn.id);
    setTestingIds(prev => {
      const next = new Set(prev);
      next.delete(conn.id);
      return next;
    });
    if (result.success) {
      toast.success(result.message);
      fetchConnections();
    } else {
      toast.error(result.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingConn) return;
    await deleteConnection(deletingConn.id);
    setDeletingConn(null);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-md w-full p-0 flex flex-col gap-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle>Database Connections</SheetTitle>
            <SheetDescription>
              Manage external database connections
            </SheetDescription>
          </SheetHeader>

          {/* Search + Add */}
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Search connections..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" className="h-9 shrink-0" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </div>

          {/* Connection list */}
          <ScrollArea className="flex-1 px-4 pb-4">
            {isLoading ? (
              <div className="space-y-2 pt-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-12 text-center">
                <Database className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? 'No connections found'
                    : 'No database connections yet'}
                </p>
                {!search.trim() && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={handleAdd}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Connection
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                {filtered.map(conn => (
                  <ConnectionCard
                    key={conn.id}
                    connection={conn}
                    onEdit={handleEdit}
                    onDelete={setDeletingConn}
                    onTest={handleTestExisting}
                    onSelect={onSelectConnection}
                    isTesting={testingIds.has(conn.id)}
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
        editing={editingConn}
        onSave={handleSave}
        onTest={handleTest}
        getDefaultPort={getDefaultPort}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deletingConn !== null} onOpenChange={open => !open && setDeletingConn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <p className="text-sm text-muted-foreground">
              Delete connection <strong>{deletingConn?.name}</strong>? 
              Diagrams using this connection still exist, but can no longer sync.
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
    </>
  );
}
