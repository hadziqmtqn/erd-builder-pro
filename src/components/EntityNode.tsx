import React, { memo, useState, useEffect, useMemo, CSSProperties } from 'react';
import { Handle, Position, NodeProps, Node, useUpdateNodeInternals } from '@xyflow/react';
import { MoreHorizontal, Pencil, Trash2, Database, AlertTriangle, Copy } from 'lucide-react';
import { Entity } from '../types';
import { cn } from '../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TableDialog } from './modals/TableDialog';
import { useWorkspace } from '../providers/WorkspaceProvider';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogBody,
} from "@/components/ui/alert-dialog";

type EntityNodeProps = NodeProps<Node<Entity>>;

interface ColumnRowProps {
  col: any;
  borderColor: string;
  typeColor: string;
}

const EntityColumnRow = memo(({ col, borderColor, typeColor }: ColumnRowProps) => {
  const isFk = col._is_fk;
  const diffState = col.diffState as 'new' | 'deleted' | undefined;

  const leftStyle: CSSProperties = useMemo(() => ({
    top: '50%', left: '-4px', transform: 'translate(-50%, -50%)', backgroundColor: borderColor, zIndex: 50,
  }), [borderColor]);

  const rightStyle: CSSProperties = useMemo(() => ({
    top: '50%', right: '-4px', transform: 'translate(50%, -50%)', backgroundColor: borderColor, zIndex: 50,
  }), [borderColor]);

  const handleBaseClass = useMemo(() => cn(
    '!w-2 !h-2 !border-none cursor-crosshair opacity-0 group-hover:!opacity-100 group-focus-within:!opacity-100 transition-opacity duration-150',
  ), []);

  const rowBgClass = useMemo(() => {
    if (diffState === 'new') return 'bg-emerald-500/10 hover:bg-emerald-500/15 border-b border-emerald-500/20';
    if (diffState === 'deleted') return 'bg-red-500/10 hover:bg-red-500/15 line-through opacity-50 border-b border-red-500/20';
    return 'border-white/5 hover:bg-white/5';
  }, [diffState]);

  return (
    <div className={cn("group relative px-3 py-2 flex items-center justify-between transition-colors border-b last:border-b-0", rowBgClass)}>
      <Handle
        type="target"
        position={Position.Left}
        id={`col-${col.id}-target`}
        className={handleBaseClass}
        style={leftStyle}
      />
      <Handle
        type="source"
        position={Position.Left}
        id={`col-${col.id}-source-l`}
        className={handleBaseClass}
        style={leftStyle}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={`col-${col.id}-source`}
        className={handleBaseClass}
        style={rightStyle}
      />
      <Handle
        type="target"
        position={Position.Right}
        id={`col-${col.id}-target-r`}
        className={handleBaseClass}
        style={rightStyle}
      />

      <div className="flex items-center gap-2">
        <span className={cn(
          "text-sm font-medium", 
          col.is_pk ? "text-white" : "text-white/80",
          diffState === 'new' && "text-emerald-400 font-semibold",
          diffState === 'deleted' && "text-red-400/80 line-through"
        )}>
          {diffState === 'new' ? `+ ${col.name}` : diffState === 'deleted' ? `- ${col.name}` : col.name}
        </span>
      </div>

      <div className="flex flex-col items-end gap-0.5 max-w-[140px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold" style={{ color: diffState === 'new' ? '#10b981' : diffState === 'deleted' ? '#ef4444' : typeColor }}>
            {col.type.toLowerCase()}
          </span>
          {(col.is_pk || isFk) && (
            <div className="flex items-center gap-1">
              {col.is_pk && <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">pk</span>}
              {isFk && <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter text-blue-400/80">fk</span>}
            </div>
          )}
        </div>
        {col.type.toUpperCase() === 'ENUM' && col.enum_values && (
          <span className="font-mono italic text-right leading-tight break-words max-w-full" style={{ fontSize: '8.5px', color: 'rgba(255, 255, 255, 0.45)' }}>
            ({col.enum_values})
          </span>
        )}
      </div>
    </div>
  );
});

const EntityNode = ({ data, id, selected }: EntityNodeProps) => {
  const { isPublicView, duplicateEntity } = useWorkspace();
  const isReadOnly = isPublicView || !!data.isDiffMode;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<'properties' | 'schema'>('properties');
  const updateNodeInternals = useUpdateNodeInternals();

  const columnOrderHash = useMemo(() => 
    data.columns.map(c => `${c.id}-${c.name}-${c.sort_order}`).join(','),
    [data.columns]
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, columnOrderHash, updateNodeInternals]);

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    setDialogTab('properties');
    setDialogOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    setShowDeleteConfirm(true);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    duplicateEntity(data.id);
  };

  const confirmDelete = () => {
    window.dispatchEvent(new CustomEvent('deleteEntity', { detail: data.id }));
    setShowDeleteConfirm(false);
  };

  const handleGenerate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogTab('schema');
    setDialogOpen(true);
  };

  const diffState = data.diffState as 'new' | 'deleted' | 'modified' | undefined;

  const { borderColor, headerBg, typeColor } = useMemo(() => {
    if (diffState === 'new') {
      return {
        borderColor: '#10b981',
        headerBg: 'rgba(16, 185, 129, 0.15)',
        typeColor: '#10b981',
      };
    }
    if (diffState === 'deleted') {
      return {
        borderColor: '#ef4444',
        headerBg: 'rgba(239, 68, 68, 0.15)',
        typeColor: '#ef4444',
      };
    }
    if (diffState === 'modified') {
      return {
        borderColor: '#f59e0b',
        headerBg: 'rgba(245, 158, 11, 0.15)',
        typeColor: '#f59e0b',
      };
    }
    return {
      borderColor: data.color,
      headerBg: `${data.color}20`,
      typeColor: data.color,
    };
  }, [data.color, diffState]);

  const containerClasses = useMemo(() => cn(
    "bg-[#0f0f14] text-white rounded-lg border-2 min-w-[220px] will-change-transform erd-node-container transition-all duration-300",
    selected && "ring-2 ring-white/10",
    diffState === 'new' && "shadow-[0_0_20px_rgba(16,185,129,0.35)]",
    diffState === 'deleted' && "opacity-40 shadow-[0_0_15px_rgba(239,68,68,0.25)]",
    diffState === 'modified' && "shadow-[0_0_20px_rgba(245,158,11,0.3)]"
  ), [selected, diffState]);

  const sortedColumns = useMemo(() => 
    [...data.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [data.columns]
  );

  return (
    <>
      <div 
        className={containerClasses}
        style={{ borderColor: borderColor, overflow: 'visible' }}
      >
        <div 
          className="px-3 py-2 flex items-center justify-between border-b-2 cursor-pointer group/header"
          style={{ backgroundColor: headerBg, borderColor: borderColor }}
          onDoubleClick={isReadOnly ? undefined : handleEdit}
          title={isReadOnly ? undefined : "Double-click to edit table"}
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 transition-transform group-hover/header:rotate-12" style={{ color: borderColor }} />
            <span className={cn(
              "font-bold text-sm tracking-wide uppercase",
              diffState === 'deleted' && "line-through text-red-400"
            )}>
              {data.name}
            </span>
            {diffState === 'new' && (
              <span className="px-1 py-0.5 text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider">NEW</span>
            )}
            {diffState === 'deleted' && (
              <span className="px-1 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase tracking-wider">DEL</span>
            )}
            {diffState === 'modified' && (
              <span className="px-1 py-0.5 text-[8px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded uppercase tracking-wider">MOD</span>
            )}
          </div>
          
          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger 
                className="nodrag nopan p-1 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors focus:outline-none"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-44 bg-[#1a1a24] border-white/10 text-white z-[1000]" 
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={handleEdit} className="cursor-pointer hover:bg-white/10 focus:bg-white/10">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer hover:bg-white/10 focus:bg-white/10">
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10 focus:bg-destructive/10">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Table
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Columns */}
        <div className="flex flex-col">
          {sortedColumns.map((col: any) => (
            <EntityColumnRow key={col.id} col={col} borderColor={borderColor} typeColor={typeColor} />
          ))}
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent size="sm" className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Table</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Are you sure you want to delete the table <strong>{data.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TableDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entity={data}
        defaultTab={dialogTab}
      />
    </>
  );
};

export default memo(EntityNode);
