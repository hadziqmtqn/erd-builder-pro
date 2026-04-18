import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps, Node, useUpdateNodeInternals } from '@xyflow/react';
import { Key, Hash, MoreHorizontal, Edit2, Trash2, Database, AlertCircle } from 'lucide-react';
import { Entity } from '../types';
import { cn } from '../lib/utils';
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
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

const EntityNode = ({ data, id, selected }: EntityNodeProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  // Notify React Flow when internal handle positions might have changed
  // Simplified dependency: watching IDs and order is fast and catches all layout shifts
  const columnOrderHash = data.columns.map(c => `${c.id}-${c.sort_order}`).join(',');
  
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, columnOrderHash, updateNodeInternals]);

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('editEntity', { detail: data.id }));
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

  // Eraser.io style colors based on data.color
  const borderColor = data.color;
  const headerBg = `${data.color}20`; // 12% opacity
  const rowHoverBg = `${data.color}10`; // 6% opacity
  const typeColor = data.color;

  return (
    <>
      <div 
        className={cn(
          "bg-[#0f0f14] text-white rounded-lg border-2 min-w-[220px] will-change-transform erd-node-container",
          selected && "ring-2 ring-white/10"
        )}
        style={{ borderColor: borderColor, overflow: 'visible' }}
      >
        {/* Header */}
        <div 
          className="px-3 py-2 flex items-center justify-between border-b-2 cursor-pointer group/header"
          style={{ backgroundColor: headerBg, borderColor: borderColor }}
          onClick={handleEdit}
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
              className="w-40 bg-[#1a1a24] border-white/10 text-white z-[1000]" 
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={handleEdit} className="cursor-pointer hover:bg-white/10 focus:bg-white/10">
                <Edit2 className="w-4 h-4 mr-2" />
                Edit Table
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
          {[...data.columns].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((col: any) => {
            const isFk = col._is_fk;
            return (
              <div 
                key={col.id} 
                className={cn(
                  "group relative px-3 py-2 flex items-center justify-between transition-colors border-b last:border-b-0 border-white/5",
                  "hover:bg-white/5"
                )}
                style={{ '--hover-bg': rowHoverBg } as React.CSSProperties}
                onMouseEnter={() => setHoveredColumnId(col.id)}
                onMouseLeave={() => setHoveredColumnId(null)}
              >
                {/* Universal Column Handles (Bidirectional) - VISIBLE ON HOVER ONLY */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`col-${col.id}-target`}
                  className={cn(
                    "!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150",
                    hoveredColumnId === col.id ? "opacity-100" : "opacity-0"
                  )}
                  style={{ top: '50%', left: '-4.5px', transform: 'translateY(-50%)', backgroundColor: borderColor, zIndex: 50 }}
                />
                <Handle
                  type="source"
                  position={Position.Left}
                  id={`col-${col.id}-source-l`}
                  className={cn(
                    "!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150",
                    hoveredColumnId === col.id ? "opacity-100" : "opacity-0"
                  )}
                  style={{ top: '50%', left: '-4.5px', transform: 'translateY(-50%)', backgroundColor: borderColor, zIndex: 50 }}
                />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`col-${col.id}-source`}
                  className={cn(
                    "!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150",
                    hoveredColumnId === col.id ? "opacity-100" : "opacity-0"
                  )}
                  style={{ top: '50%', right: '-4.5px', transform: 'translateY(-50%)', backgroundColor: borderColor, zIndex: 50 }}
                />
                <Handle
                  type="target"
                  position={Position.Right}
                  id={`col-${col.id}-target-r`}
                  className={cn(
                    "!w-1.5 !h-1.5 !border-none cursor-crosshair transition-opacity duration-150",
                    hoveredColumnId === col.id ? "opacity-100" : "opacity-0"
                  )}
                  style={{ top: '50%', right: '-4.5px', transform: 'translateY(-50%)', backgroundColor: borderColor, zIndex: 50 }}
                />

                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium",
                    col.is_pk ? "text-white" : "text-white/80"
                  )}>
                    {col.name}
                  </span>
                </div>
                
                <div className="flex flex-col items-end gap-0.5 max-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="text-[11px] font-mono font-semibold"
                      style={{ color: typeColor }}
                    >
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
                    <span 
                      className="font-mono italic text-right leading-tight break-words max-w-full"
                      style={{ fontSize: '8.5px', color: 'rgba(255, 255, 255, 0.45)' }}
                    >
                      ({col.enum_values})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* General Node Handles explicitly removed to enforce column-to-column relations */}
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertCircle className="text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Table</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Are you sure you want to delete the table <strong>{data.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
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
    </>
  );
};

export default memo(EntityNode);
