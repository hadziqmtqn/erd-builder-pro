import { useState } from 'react';
import { Node } from '@xyflow/react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogBody,
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
import { Trash2 } from 'lucide-react';
import { FlowchartNodeData, FlowchartShape } from '../FlowchartNode';
import { COLOR_PALETTE, SHAPE_LABELS } from './flowchartConstants';

interface SymbolPropertiesModalProps {
  selectedNodeId: string | null;
  onClose: () => void;
  selectedNode?: Node<FlowchartNodeData>;
  onUpdateNodeData: (updates: Partial<FlowchartNodeData>) => void;
  onDeleteNode: () => void;
  onDeleteGroup?: () => void;
  onValidateSection?: (section: string) => boolean;
}

function isStartNode(node: Node<FlowchartNodeData>): boolean {
  return node.data.label.trim().toLowerCase().includes('start');
}

export function SymbolPropertiesModal({
  selectedNodeId,
  onClose,
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
  onDeleteGroup,
  onValidateSection,
}: SymbolPropertiesModalProps) {
  const isStart = selectedNode ? isStartNode(selectedNode) : false;
  const getDefaultCode = () => {
    if (!selectedNode) return '';
    if (selectedNode.data.code) return selectedNode.data.code;
    return selectedNode.data.shape === 'diamond'
      ? "return context.amount > 100 ? 'Yes' : 'No';"
      : "context.status = 'Approved';";
  };
  const [localCode, setLocalCode] = useState(getDefaultCode);

  const handleCodeChange = (val: string) => {
    setLocalCode(val);
    onUpdateNodeData({ code: val });
  };

  return (
    <Dialog open={!!selectedNodeId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Symbol Properties</DialogTitle>
          <DialogDescription>
            Customize the name, shape, and color of this symbol.
          </DialogDescription>
        </DialogHeader>
        
        {selectedNode && (
          <DialogBody key={selectedNodeId} className="space-y-6">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input 
                value={selectedNode.data.label}
                onChange={(e) => onUpdateNodeData({ label: e.target.value })}
                placeholder="Enter symbol label"
                className="bg-muted/50 border-border text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-300">Code Logic (JavaScript)</Label>
              <textarea 
                value={localCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder={selectedNode.data.shape === 'diamond' 
                  ? "e.g. return context.amount > 100 ? 'Yes' : 'No';" 
                  : "e.g. context.status = 'Approved'; context.tries += 1;"}
                className="w-full h-24 bg-black/50 border border-white/10 rounded-md p-2 text-xs font-mono text-white resize-none focus:outline-none focus:border-white/20 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-850 [&::-webkit-scrollbar-thumb]:rounded-full"
              />
              <p className="text-[9px] text-muted-foreground/50 leading-normal">
                Attached sandbox logic. For Decision diamonds, return the matching branch label (case-sensitive). Process symbols can mutate variables in the <code>context</code> object.
              </p>
            </div>

            {isStart && (
              <div className="space-y-2">
                <Label>Group Title</Label>
                <Input 
                  value={selectedNode.data.section || ''}
                  onChange={(e) => onUpdateNodeData({ section: e.target.value || undefined })}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && onValidateSection && !onValidateSection(val)) {
                      onUpdateNodeData({ section: undefined });
                    }
                  }}
                  placeholder="e.g. Pengajuan Cuti"
                  className="bg-muted/50 border-border text-foreground"
                />
                <p className="text-[10px] text-muted-foreground/50">Nama grup untuk alur yang dimulai dari sini.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Shape Type</Label>
              <Select 
                value={selectedNode.data.shape} 
                onValueChange={(val: FlowchartShape | null) => val && onUpdateNodeData({ shape: val })}
              >
                <SelectTrigger className="w-full bg-muted border-border text-foreground">
                  <SelectValue placeholder="Select a shape">
                    {selectedNode.data.shape ? SHAPE_LABELS[selectedNode.data.shape] : "Select a shape"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground">
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

            <div className="pt-2 border-t border-white/10 space-y-2">
              <Button
                variant="destructive"
                size="sm"
                className="w-full gap-2"
                onClick={() => { onDeleteNode(); onClose(); }}
              >
                <Trash2 className="size-4" />
                Delete Symbol
              </Button>
              {isStart && selectedNode.data.section && onDeleteGroup && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => { onDeleteGroup(); onClose(); }}
                >
                  <Trash2 className="size-4" />
                  Delete Group "{selectedNode.data.section}"
                </Button>
              )}
            </div>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}
