import React from 'react';
import { Trash2, Link2 } from 'lucide-react';
import { Edge, Node } from '@xyflow/react';
import { RELATIONSHIP_TYPES } from '../lib/utils';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Entity } from '../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RelationshipPropertiesPanelProps {
  selectedEdge: Edge | null;
  nodes: Node<Entity>[];
  onUpdateEdge: (edgeId: string, label: string) => void;
  onDeleteEdge: (id: string) => void;
}

export default function RelationshipPropertiesPanel({ 
  selectedEdge, 
  nodes,
  onUpdateEdge, 
  onDeleteEdge 
}: RelationshipPropertiesPanelProps) {
  if (!selectedEdge) return null;

  const getDisplayName = (nodeId: string, handleId: string | undefined | null) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return nodeId;
    
    if (!handleId) return node.data.name;
    
    const colId = handleId.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
    const column = node.data.columns.find(c => c.id === colId);
    
    return `${node.data.name}.${column ? column.name : colId}`;
  };

  return (
    <div className="space-y-6 py-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            Relationship Cardinality
          </Label>
          <Select
            value={RELATIONSHIP_TYPES.find(t => t.shortLabel === selectedEdge.label)?.value || RELATIONSHIP_TYPES[1].value}
            onValueChange={(value) => {
              const type = RELATIONSHIP_TYPES.find(t => t.value === value);
              if (type) onUpdateEdge(selectedEdge.id, type.shortLabel);
            }}
          >
            <SelectTrigger className="w-full h-10 bg-background border-white/10 text-sm">
              <SelectValue placeholder="Select type">
                {RELATIONSHIP_TYPES.find(t => t.shortLabel === selectedEdge.label)?.label || RELATIONSHIP_TYPES[1].label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a24] border-white/10 text-white">
              {RELATIONSHIP_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-xs focus:bg-white/10 focus:text-white">
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="pt-4">
          <Button 
            variant="destructive" 
            size="sm" 
            className="w-full h-9 text-xs font-bold gap-2"
            onClick={() => onDeleteEdge(selectedEdge.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Relationship
          </Button>
        </div>
      </div>
      
      <div className="rounded-xl bg-muted/20 p-4 border border-border/40">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-blue-400">Source</span>
            <span className="text-[11px] font-mono text-white font-bold">{getDisplayName(selectedEdge.source, selectedEdge.sourceHandle)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-purple-400">Target</span>
            <span className="text-[11px] font-mono text-white font-bold">{getDisplayName(selectedEdge.target, selectedEdge.targetHandle)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
