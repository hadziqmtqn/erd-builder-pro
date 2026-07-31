import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogBody,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogMedia,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Cable,
  Loader2,
  Database,
  Plus,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Unplug,
} from 'lucide-react';
import type { DbAccount, DbCatalog, DatabaseEntry, DbType } from '@/hooks/useConnections';

const DB_TYPE_LABELS: Record<DbType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
};

const DB_TYPE_COLORS: Record<DbType, string> = {
  postgresql: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  mysql: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  sqlite: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
};

interface ConnectionCardProps {
  account: DbAccount;
  catalogs: DbCatalog[];
  onEdit: (account: DbAccount) => void;
  onDelete: (account: DbAccount) => void;
  onTest: (account: DbAccount) => void;
  onAddCatalog: (account: DbAccount) => void;
  onImportCatalog: (catalog: DbCatalog) => void;
  onDeleteCatalog: (catalog: DbCatalog) => void;
  isTesting?: boolean;
}

export function ConnectionCard({
  account,
  catalogs,
  onEdit,
  onDelete,
  onTest,
  onAddCatalog,
  onImportCatalog,
  onDeleteCatalog,
  isTesting,
}: ConnectionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deletingCatalog, setDeletingCatalog] = useState<DbCatalog | null>(null);

  const { id, name, type, host, port } = account;

  const hostDisplay = type === 'sqlite'
    ? host || 'Local file'
    : host ? `${host}:${port || ''}` : '-';

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <>
      <div className="rounded-lg border transition-colors hover:bg-accent/50">
        {/* Account header */}
        <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={toggleExpanded}>
          {/* DB type indicator */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted/50">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{name}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${DB_TYPE_COLORS[type]}`}>
                {DB_TYPE_LABELS[type]}
              </Badge>
              {catalogs.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted">
                  {type === 'sqlite' ? '1 DB' : `${catalogs.length} DB`}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground truncate">
              {hostDisplay}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={toggleExpanded}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" />
                }
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); onTest(account); }} disabled={isTesting} className="cursor-pointer">
                  {isTesting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <Cable className="h-3.5 w-3.5 mr-2" />
                  )}
                  Test
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); onEdit(account); }} className="cursor-pointer">
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); onDelete(account); }} className="cursor-pointer text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expanded: catalogs */}
        {expanded && (
          <div className="border-t px-3 py-2 space-y-1.5">
            {catalogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No databases connected yet</p>
            ) : (
              <ScrollArea className="max-h-48">
                {catalogs.map(cat => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50 group/cat"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">{cat.label || cat.databaseName}</span>
                      {cat.label && cat.label !== cat.databaseName && (
                        <span className="text-[10px] text-muted-foreground">({cat.databaseName})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-6 w-6"
                        title="Import as ERD"
                        onClick={(e) => { e.stopPropagation(); onImportCatalog(cat); }}
                      >
                        <Database className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        title="Disconnect database"
                        onClick={(e) => { e.stopPropagation(); setDeletingCatalog(cat); }}
                      >
                        <Unplug className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            )}

            {type !== 'sqlite' && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs justify-start text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onAddCatalog(account); }}
              >
                <Plus className="h-3 w-3 mr-1.5" />
                Add Database
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete catalog confirmation */}
      <AlertDialog open={deletingCatalog !== null} onOpenChange={open => !open && setDeletingCatalog(null)}>
        <AlertDialogContent size="sm" className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <Unplug className="w-5 h-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Disconnect Database</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Disconnect <strong>{deletingCatalog?.label || deletingCatalog?.databaseName}</strong>?
              ERD Builder files created from this database will also be deleted.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingCatalog) onDeleteCatalog(deletingCatalog);
                setDeletingCatalog(null);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
