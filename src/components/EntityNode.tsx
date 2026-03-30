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
            className="group px-3 py-1.5 flex items-center justify-between hover:bg-bg-secondary rounded-md transition-colors"
          >
            <div className="flex items-center gap-2">
              {col.is_pk ? (
                <Key className="w-3 h-3 text-yellow-500" />
              ) : (
                <Hash className="w-3 h-3 text-text-secondary" />
              )}
              <span className="text-xs font-medium">{col.name}</span>
            </div>
            <span className="text-[10px] font-mono text-text-secondary bg-bg-primary px-1.5 py-0.5 rounded border border-border">
              {col.type}
            </span>
          </div>
        ))}
      </div>

      {/* Handles */}
      <Handle type="target" position={Position.Left} className="!bg-accent-primary" />
      <Handle type="source" position={Position.Right} className="!bg-accent-primary" />
      <Handle type="target" position={Position.Top} className="!bg-accent-primary" />
      <Handle type="source" position={Position.Bottom} className="!bg-accent-primary" />
    </div>
  );
};

export default memo(EntityNode);
