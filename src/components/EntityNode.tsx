import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Key, Hash, MoreHorizontal } from 'lucide-react';
import { Entity } from '../types';
import { cn } from '../lib/utils';

type EntityNodeProps = NodeProps<Node<Entity>>;

const EntityNode = ({ data, selected }: EntityNodeProps) => {
  return (
    <div className={cn(
      "custom-node min-w-[220px] overflow-hidden",
      selected && "selected"
    )}>
      {/* Header */}
      <div 
        className="px-4 py-2 flex items-center justify-between border-b border-border"
        style={{ backgroundColor: `${data.color}20` }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: data.color }}
          />
          <span className="font-bold text-sm tracking-tight">{data.name}</span>
        </div>
        <MoreHorizontal className="w-4 h-4 text-text-secondary cursor-pointer hover:text-text-primary" />
      </div>

      {/* Columns */}
      <div className="p-1">
        {data.columns.map((col) => (
          <div 
            key={col.id} 
            className="group relative px-3 py-1.5 flex items-center justify-between hover:bg-bg-secondary rounded-md transition-colors"
          >
            {/* Column Handles */}
            <Handle
              type="target"
              position={Position.Left}
              id={`col-${col.id}-target`}
              className="!w-2.5 !h-2.5 !-left-1.5 !bg-accent-primary !border-2 !border-bg-primary hover:!scale-125 transition-transform"
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`col-${col.id}-source`}
              className="!w-2.5 !h-2.5 !-right-1.5 !bg-accent-primary !border-2 !border-bg-primary hover:!scale-125 transition-transform"
            />

            <div className="flex items-center gap-2">
              {col.is_pk ? (
                <Key className="w-3 h-3 text-yellow-500" />
              ) : (
                <Hash className="w-3 h-3 text-text-secondary" />
              )}
              <span className="text-xs font-medium">{col.name}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-mono text-text-secondary bg-bg-primary px-1.5 py-0.5 rounded border border-border">
                {col.type}
              </span>
              {col.type === 'ENUM' && col.enum_values && (
                <span className="text-[8px] text-text-secondary italic max-w-[100px] truncate" title={col.enum_values}>
                  ({col.enum_values})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* General Node Handles */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-1 !rounded-none !bg-border" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-1 !rounded-none !bg-border" />
    </div>
  );
};

export default memo(EntityNode);
