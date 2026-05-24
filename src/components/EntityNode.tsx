import React, { memo, useState, useEffect, useMemo, CSSProperties } from 'react';
import { Handle, Position, NodeProps, Node, useUpdateNodeInternals } from '@xyflow/react';
import { MoreHorizontal, Pencil, Trash2, Database, AlertTriangle } from 'lucide-react';
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

  const leftStyle: CSSProperties = useMemo(() => ({
    top: '50%', left: '-4px', transform: 'translate(-50%, -50%)', backgroundColor: borderColor, zIndex: 50,
  }), [borderColor]);

  const rightStyle: CSSProperties = useMemo(() => ({
    top: '50%', right: '-4px', transform: 'translate(50%, -50%)', backgroundColor: borderColor, zIndex: 50,
  }), [borderColor]);

  return (
    <div className="group relative px-3 py-2 flex items-center justify-between transition-colors border-b last:border-b-0 border-white/5 hover:bg-white/5">
      <Handle
        type="target"
        position={Position.Left}
        id={`col-${col.id}-target`}
        className="!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150 opacity-0 group-hover:opacity-100"
        style={leftStyle}
      />
      <Handle
        type="source"
        position={Position.Left}
        id={`col-${col.id}-source-l`}
        className="!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150 opacity-0 group-hover:opacity-100"
        style={leftStyle}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={`col-${col.id}-source`}
        className="!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150 opacity-0 group-hover:opacity-100"
        style={rightStyle}
      />
      <Handle
        type="target"
        position={Position.Right}
        id={`col-${col.id}-target-r`}
        className="!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150 opacity-0 group-hover:opacity-100"
        style={rightStyle}
      />

      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-medium", col.is_pk ? "text-white" : "text-white/80")}>
          {col.name}
        </span>
      </div>

      <div className="flex flex-col items-end gap-0.5 max-w-[140px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold" style={{ color: typeColor }}>
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
    setDialogTab('properties');
    setDialogOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
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

  const { borderColor, headerBg, typeColor } = useMemo(() => ({
    borderColor: data.color,
    headerBg: `${data.color}20`,
    typeColor: data.color,
  }), [data.color]);

  const containerClasses = useMemo(() => cn(
    "bg-[#0f0f14] text-white rounded-lg border-2 min-w-[220px] will-change-transform erd-node-container",
    selected && "ring-2 ring-white/10"
  ), [selected]);

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
          onDoubleClick={handleEdit}
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 transition-transform group-hover/header:rotate-12" style={{ color: borderColor }} />
            <span className="font-bold text-sm tracking-wide uppercase">{data.name}</span>
          </div>
          
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
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10 focus:bg-destructive/10">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
