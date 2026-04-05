import React from 'react';
import { Edge } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LINE_STYLE_LABELS, ARROW_STYLE_LABELS } from './flowchartConstants';

interface ConnectorPropertiesModalProps {
  selectedEdgeId: string | null;
  onClose: () => void;
  selectedEdge?: Edge;
  isDashed: boolean;
  arrowType: string;
  onEdgeTypeChange: (val: string) => void;
  onArrowChange: (val: string) => void;
  onDeleteEdge: () => void;
}

export function ConnectorPropertiesModal({
  selectedEdgeId,
  onClose,
  selectedEdge,
  isDashed,
  arrowType,
  onEdgeTypeChange,
  onArrowChange,
  onDeleteEdge
}: ConnectorPropertiesModalProps) {
  return (
    <Dialog open={!!selectedEdgeId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm w-full border-white/10 bg-[#0f0f14] shadow-2xl">
        <DialogHeader className="shrink-0 mb-4">
          <div className="flex items-center justify-between pr-8">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight">Connector Properties</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Format the line style and arrows.
              </DialogDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onDeleteEdge}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2"
              title="Delete Connector"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {selectedEdge && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Line Style</Label>
              <Select value={isDashed ? 'dashed' : 'solid'} onValueChange={onEdgeTypeChange}>
                <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                  <SelectValue placeholder="Select line style">
                    {LINE_STYLE_LABELS[isDashed ? 'dashed' : 'solid']}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                  <SelectItem value="solid">Solid Line</SelectItem>
                  <SelectItem value="dashed">Dashed Line</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Arrow Style</Label>
              <Select value={arrowType} onValueChange={onArrowChange}>
                <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                  <SelectValue placeholder="Select arrow style">
                    {ARROW_STYLE_LABELS[arrowType]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                  <SelectItem value="end">Arrow at End</SelectItem>
                  <SelectItem value="start">Arrow at Start (Reverse)</SelectItem>
                  <SelectItem value="both">Arrows Both Ends</SelectItem>
                  <SelectItem value="none">No Arrows (Line only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
