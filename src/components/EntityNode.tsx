import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Key, Hash, MoreHorizontal } from 'lucide-react';
import { Entity } from '../types';
import { cn } from '../lib/utils';
import { Badge } from "@/components/ui/badge";

type EntityNodeProps = NodeProps<Node<Entity>>;

const EntityNode = ({ data, selected }: EntityNodeProps) => {
  return (
    <div className={cn(
      "bg-card text-card-foreground rounded-xl border shadow-sm min-w-[220px] overflow-hidden transition-all",
      selected && "ring-2 ring-primary border-primary"
    )}>
      {/* Header */}
      <div 
        className="px-4 py-2.5 flex items-center justify-between border-b"
        style={{ backgroundColor: `${data.color}15` }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-2.5 h-2.5 rounded-full shadow-sm" 
            style={{ backgroundColor: data.color }}
          />
          <span className="font-bold text-sm tracking-tight">{data.name}</span>
        </div>
        <MoreHorizontal className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
      </div>

      {/* Columns */}
      <div className="p-1.5 space-y-0.5">
        {data.columns.map((col) => (
          <div 
            key={col.id} 
            className="group relative px-3 py-2 flex items-center justify-between hover:bg-muted/50 rounded-lg transition-colors"
          >
            {/* Column Handles */}
            <Handle
              type="target"
              position={Position.Left}
              id={`col-${col.id}-target`}
              className="!w-2.5 !h-2.5 !-left-1.5 !bg-primary !border-2 !border-background hover:!scale-125 transition-transform"
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`col-${col.id}-source`}
              className="!w-2.5 !h-2.5 !-right-1.5 !bg-primary !border-2 !border-background hover:!scale-125 transition-transform"
            />

            <div className="flex items-center gap-2">
              {col.is_pk ? (
                <Key className="w-3.5 h-3.5 text-yellow-500" />
              ) : (
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium">{col.name}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0 h-4 leading-none bg-muted/50 text-muted-foreground border-none">
                {col.type}
              </Badge>
              {col.type === 'ENUM' && col.enum_values && (
                <span className="text-[8px] text-muted-foreground italic max-w-[80px] truncate" title={col.enum_values}>
                  ({col.enum_values})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* General Node Handles */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-1 !rounded-none !bg-border !border-none" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-1 !rounded-none !bg-border !border-none" />
    </div>
  );
};

export default memo(EntityNode);
