import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Pencil, Trash2, Cable, Loader2 } from 'lucide-react';
import type { Connection, DbType } from '@/hooks/useConnections';

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
  connection: Connection;
  onEdit: (conn: Connection) => void;
  onDelete: (conn: Connection) => void;
  onTest: (conn: Connection) => void;
  onSelect?: (conn: Connection) => void;
  isTesting?: boolean;
}

export function ConnectionCard({
  connection,
  onEdit,
  onDelete,
  onTest,
  onSelect,
  isTesting,
}: ConnectionCardProps) {
  const { id, name, type, host, database, is_test_ok } = connection;

  const hostDisplay = type === 'sqlite'
    ? database
    : host ? `${host}:${connection.port || ''}` : '-';

  return (
    <div
      className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 cursor-pointer"
      onClick={() => onSelect?.(connection)}
    >
      {/* DB type indicator */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted/50">
        <Cable className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{name}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${DB_TYPE_COLORS[type]}`}>
            {DB_TYPE_LABELS[type]}
          </Badge>
          {is_test_ok === true && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
              OK
            </Badge>
          )}
          {is_test_ok === false && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
              Failed
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {hostDisplay}
        </div>
      </div>

      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="h-7 w-7" />
            }
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onTest(connection)} disabled={isTesting} className="cursor-pointer">
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              ) : (
                <Cable className="h-3.5 w-3.5 mr-2" />
              )}
              Test
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(connection)} className="cursor-pointer">
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(connection)} className="cursor-pointer text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
