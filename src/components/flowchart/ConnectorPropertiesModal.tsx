import { Edge } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogBody
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  onLabelChange: (val: string) => void;
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
  onLabelChange,
  onDeleteEdge
}: ConnectorPropertiesModalProps) {
  return (
    <Dialog open={!!selectedEdgeId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div className="space-y-1 text-left">
              <DialogTitle>Connector Properties</DialogTitle>
              <DialogDescription>
                Format the line style and arrows.
              </DialogDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onDeleteEdge}
              className="text-destructive hover:bg-destructive/10 -mr-2 shadow-none"
              title="Delete Connector"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {selectedEdge && (
          <DialogBody className="space-y-6">
            <div className="space-y-2">
              <Label>Text Label</Label>
              <Input 
                value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''} 
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="e.g. Yes, No, 1, 2..."
                className="bg-black/50 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Line Style</Label>
              <Select value={isDashed ? 'dashed' : 'solid'} onValueChange={onEdgeTypeChange}>
                <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                  <SelectValue placeholder="Select line style" />
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
                  <SelectValue placeholder="Select arrow style" />
                </SelectTrigger>
                <SelectContent className="bg-[#1e1e24] border-white/10 text-white">
                  <SelectItem value="end">Arrow at End</SelectItem>
                  <SelectItem value="start">Arrow at Start (Reverse)</SelectItem>
                  <SelectItem value="both">Arrows Both Ends</SelectItem>
                  <SelectItem value="none">No Arrows (Line only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}
