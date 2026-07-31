import { RefObject, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, Database, FileUp, Plus, Search, TableIcon, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { DataViewerTableActions } from './DataViewerTableActions';

type DataViewerSidebarProps = {
  activeTable: string | null;
  connectionId: number;
  dbType: string | null;
  error: string | null;
  filteredTables: any[];
  isLoadingTables: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  shortcutLabel: string;
  tableSearch: string;
  tables: any[];
  onAddTable: () => void;
  onDeleteTables: (tableNames: string[], options: { ignoreForeignKeys?: boolean; cascade?: boolean }) => Promise<any>;
  onMutateTables: (patch: Record<string, any>) => Promise<any>;
  onRefreshTables: () => Promise<any> | any;
  onSelectTable: (tableName: string) => void;
  setTableSearch: (value: string) => void;
};

export function DataViewerSidebar({
  activeTable,
  connectionId,
  dbType,
  error,
  filteredTables,
  isLoadingTables,
  searchRef,
  shortcutLabel,
  tableSearch,
  tables,
  onAddTable,
  onDeleteTables,
  onMutateTables,
  onRefreshTables,
  onSelectTable,
  setTableSearch,
}: DataViewerSidebarProps) {
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [ignoreForeignKeys, setIgnoreForeignKeys] = useState(false);
  const [cascade, setCascade] = useState(false);
  const lastSelectedTableRef = useRef<string | null>(null);
  const selectedSet = new Set(selectedTables);
  const supportsTableMutation = dbType === 'mysql' || dbType === 'postgresql';
  const visibleNames = filteredTables.map((table: any) => table.table_name);
  const selectedTableObjects = tables.filter((table: any) => selectedSet.has(table.table_name));
  const setImportSqlFile = (file: File | null) => {
    if (file && !/\.sql$/i.test(file.name)) return toast.error('Choose a .sql file');
    setImportFile(file);
  };
  const handleTableClick = (e: React.MouseEvent, tableName: string) => {
    if (e.shiftKey && lastSelectedTableRef.current) {
      const from = visibleNames.indexOf(lastSelectedTableRef.current);
      const to = visibleNames.indexOf(tableName);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        setSelectedTables(prev => [...new Set([...prev, ...visibleNames.slice(start, end + 1)])]);
        return;
      }
    }
    lastSelectedTableRef.current = tableName;
    if (selectedTables.length > 0) setSelectedTables([]);
    onSelectTable(tableName);
  };
  const validateImportText = (sql: string) => {
    if (!dbType) return "Database driver is unknown";
    if (!sql.trim()) return "SQL file is empty";
    if (dbType === 'postgresql' && /`|auto_increment|engine\s*=|pragma\s+/i.test(sql)) return "This file looks like MySQL/SQLite SQL, not PostgreSQL";
    if (dbType === 'mysql' && /\bserial\b|::|create\s+extension|pragma\s+/i.test(sql)) return "This file looks like PostgreSQL/SQLite SQL, not MySQL";
    if (dbType === 'sqlite' && /engine\s*=|auto_increment|create\s+extension|\bserial\b|set\s+foreign_key_checks/i.test(sql)) return "This file looks incompatible with SQLite";
    return "";
  };
  const handleDelete = async () => {
    try {
      await onDeleteTables(selectedTables, { ignoreForeignKeys: dbType === 'mysql' ? ignoreForeignKeys : false, cascade });
      toast.success(`${selectedTables.length} table${selectedTables.length === 1 ? '' : 's'} deleted`);
      setSelectedTables([]);
      setConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tables');
    }
  };
  const handleImportSql = async () => {
    if (!importFile) return toast.error('Choose a .sql file first');
    try {
      setIsImporting(true);
      setImportProgress(20);
      const sql = await importFile.text();
      setImportProgress(45);
      const validationError = validateImportText(sql);
      if (validationError) throw new Error(validationError);
      const res = await apiFetch(`/api/catalogs/${connectionId}/structure/import-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      setImportProgress(80);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import SQL');
      toast.success(`Imported ${data.statements || 0} SQL statement${data.statements === 1 ? '' : 's'}`);
      setImportOpen(false);
      setImportFile(null);
      setImportProgress(100);
      onRefreshTables();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import SQL');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="w-64 shrink-0 border-r bg-muted/20 flex flex-col overflow-hidden"
      data-db-client-sidebar
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          setSelectedTables(visibleNames);
          lastSelectedTableRef.current = visibleNames[0] || null;
        }
      }}
    >
      <div className="px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Tables
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" />}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Create
              <ChevronDown className="ml-1 h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <FileUp className="h-3.5 w-3.5" />
                Import SQL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddTable}>
                <Plus className="h-3.5 w-3.5" />
                Create new Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            ref={searchRef}
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
            placeholder={`Search tables... (${shortcutLabel})`}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-2">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">{selectedTables.length} selected</span>
          {selectedTables.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setSelectedTables([])}>Clear</Button>}
        </div>
        <div className="p-1.5 space-y-0.5">
          {isLoadingTables ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
            </div>
          ) : tables.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              {error ? (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              ) : (
                'No tables found'
              )}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">No matching tables</div>
          ) : (
            filteredTables.map((table: any) => (
              <div
                key={table.table_name}
                role="button"
                tabIndex={0}
                onClick={e => handleTableClick(e, table.table_name)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTableClick(e as any, table.table_name);
                  }
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  selectedSet.has(table.table_name)
                    ? 'bg-primary/15 text-foreground ring-1 ring-primary/20'
                  : activeTable === table.table_name
                    ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate">{table.table_name}</span>
                <DataViewerTableActions
                  connectionId={connectionId}
                  dbType={dbType}
                  table={table}
                  tables={tables}
                  onDeleteTables={onDeleteTables}
                  onMutateTables={onMutateTables}
                />
              </div>
            ))
          )}
        </div>
      </div>
      <div className="border-t bg-background/95 p-2">
        <ButtonGroup className="flex w-full">
          <DataViewerTableActions
            connectionId={connectionId}
            dbType={dbType}
            table={selectedTableObjects[0] || tables[0] || { table_name: 'tables', columns: [] }}
            tables={tables}
            exportTables={selectedTableObjects}
            label="Export All"
            mode="button"
            buttonClassName="h-8 min-w-0 flex-1 px-1.5 text-[11px]"
            onDeleteTables={onDeleteTables}
            onMutateTables={onMutateTables}
          />
          <Button type="button" variant="outline" className="h-8 min-w-0 flex-1 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={!supportsTableMutation || selectedTables.length === 0} onClick={() => setConfirmOpen(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete All
          </Button>
        </ButtonGroup>
      </div>
      <Dialog open={importOpen} onOpenChange={open => !open && setImportOpen(false)}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Import SQL</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Only table import SQL for {dbType || 'the selected driver'} is supported.
            </div>
            <label
              className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors ${isDraggingFile ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'}`}
              onDragOver={e => { e.preventDefault(); setIsDraggingFile(true); }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDraggingFile(false);
                setImportSqlFile(e.dataTransfer.files?.[0] || null);
              }}
            >
              <FileUp className="mb-2 h-6 w-6 text-muted-foreground" />
              <span className="font-medium">{importFile?.name || 'Drop SQL file here'}</span>
              <span className="mt-1 text-xs text-muted-foreground">or click to choose a .sql file</span>
              <input type="file" accept=".sql,text/sql,text/plain" className="hidden" onChange={e => setImportSqlFile(e.target.files?.[0] || null)} />
            </label>
            {isImporting && (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${importProgress}%` }} />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={isImporting}>Cancel</Button>
            <Button onClick={handleImportSql} disabled={!importFile || isImporting}>{isImporting ? 'Importing...' : 'Import SQL'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tables</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody className="space-y-3">
            {dbType === 'mysql' && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={ignoreForeignKeys}
                  onChange={e => { setIgnoreForeignKeys(e.target.checked); if (e.target.checked) setCascade(false); }}
                />
                <span>
                  <span className="block font-medium">Ignore foreign key checks</span>
                  <span className="text-xs text-muted-foreground">Disable MySQL FK checks during delete.</span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={cascade}
                disabled={dbType === 'mysql' && ignoreForeignKeys}
                onChange={e => setCascade(e.target.checked)}
              />
              <span>
                <span className="block font-medium">Cascade</span>
                <span className="text-xs text-muted-foreground">Drop dependent foreign keys where the database supports it.</span>
              </span>
            </label>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
