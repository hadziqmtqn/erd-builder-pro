import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogBody
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlowchartNodeData, FlowchartShape } from '../FlowchartNode';
import { COLOR_PALETTE, SHAPE_LABELS } from './flowchartConstants';

interface AddSymbolModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  nodeData: FlowchartNodeData;
  onNodeDataChange: (data: FlowchartNodeData) => void;
  onConfirm: () => void;
}

export function AddSymbolModal({ 
  isOpen, 
  onOpenChange, 
  nodeData, 
  onNodeDataChange, 
  onConfirm 
}: AddSymbolModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create New Symbol</DialogTitle>
          <DialogDescription>
            Configure the symbol before placing it on the canvas.
          </DialogDescription>
        </DialogHeader>
        
        <DialogBody className="space-y-6">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input 
              value={nodeData.label}
              onChange={(e) => onNodeDataChange({ ...nodeData, label: e.target.value })}
              placeholder="Enter symbol label"
              className="bg-black/50 border-white/10 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label>Shape Type</Label>
            <Select 
              value={nodeData.shape} 
              onValueChange={(val: FlowchartShape) => onNodeDataChange({ ...nodeData, shape: val })}
            >
              <SelectTrigger className="w-full bg-black/50 border-white/10 text-white">
                <SelectValue placeholder="Select a shape">
                  {nodeData.shape ? SHAPE_LABELS[nodeData.shape] : "Select a shape"}
                </SelectValue>
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
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${nodeData.color === color ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => onNodeDataChange({ ...nodeData, color })}
                />
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" className="border-white/10" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} className="bg-primary text-primary-foreground">Add to Flowchart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
