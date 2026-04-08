import React from 'react';
import { Node } from '@xyflow/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlowchartNodeData, FlowchartShape } from '../FlowchartNode';
import { COLOR_PALETTE, SHAPE_LABELS } from './flowchartConstants';

interface SymbolPropertiesModalProps {
  selectedNodeId: string | null;
  onClose: () => void;
  selectedNode?: Node<FlowchartNodeData>;
  onUpdateNodeData: (updates: Partial<FlowchartNodeData>) => void;
}

export function SymbolPropertiesModal({
  selectedNodeId,
  onClose,
  selectedNode,
  onUpdateNodeData
}: SymbolPropertiesModalProps) {
  return (
    <Dialog open={!!selectedNodeId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
        <DialogHeader className="shrink-0 mb-4">
          <DialogTitle className="text-xl font-bold tracking-tight">Symbol Properties</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Customize the name, shape, and color of this symbol.
          </DialogDescription>
        </DialogHeader>
        
        {selectedNode && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input 
                value={selectedNode.data.label}
                onChange={(e) => onUpdateNodeData({ label: e.target.value })}
                placeholder="Enter symbol label"
                className="bg-black/50 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Shape Type</Label>
              <Select 
                value={selectedNode.data.shape} 
                onValueChange={(val: FlowchartShape) => onUpdateNodeData({ shape: val })}
              >
                <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                  <SelectValue placeholder="Select a shape" />
                </SelectTrigger>
                <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                  <SelectItem value="rectangle">Rectangle (Process)</SelectItem>
                  <SelectItem value="oval">Oval (Start/End)</SelectItem>
                  <SelectItem value="diamond">Diamond (Decision)</SelectItem>
                  <SelectItem value="parallelogram">Parallelogram (Input/Output)</SelectItem>
                  <SelectItem value="database">Cylinder (Database)</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="cloud">Cloud (External System)</SelectItem>
                  <SelectItem value="circle">Circle (Connector)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${selectedNode.data.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => onUpdateNodeData({ color })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
