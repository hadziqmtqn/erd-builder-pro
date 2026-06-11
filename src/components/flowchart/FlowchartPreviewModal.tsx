import { useState, useRef, useCallback, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FlowchartNodeData } from '../FlowchartNode';
import { Check, X, Layers, GitBranch } from 'lucide-react';

interface FlowchartPreviewModalProps {
  nodes: Node<FlowchartNodeData>[];
  edges: Edge[];
  onConfirm: (groupSection?: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  canvasGroups?: string[];
  existingNodes?: Node<FlowchartNodeData>[];
  existingEdges?: Edge[];
}

type DiffLine =
  | { type: 'header'; label: string; isNew?: boolean }
  | { type: 'add' | 'remove' | 'change'; prefix: string; field: string; oldVal?: string; newVal?: string };

export function FlowchartPreviewModal({
  nodes,
  edges,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm Append',
  canvasGroups = [],
  existingNodes = [],
  existingEdges = [],
}: FlowchartPreviewModalProps) {
  const [replaceGroup, setReplaceGroup] = useState<string | null>(null);

  const diff = useMemo<DiffLine[] | null>(() => {
    if (!existingNodes.length || !nodes.length) return null;

    const existingByLabel = new Map<string, Node<FlowchartNodeData>>();
    for (const node of existingNodes) {
      existingByLabel.set((node.data.label || '').toLowerCase(), node);
    }
    const newByLabel = new Map<string, Node<FlowchartNodeData>>();
    for (const node of nodes) {
      newByLabel.set((node.data.label || '').toLowerCase(), node);
    }

    const lines: DiffLine[] = [];

    for (const node of nodes) {
      const label = node.data.label || 'Untitled';
      const existing = existingByLabel.get(label.toLowerCase());
      if (!existing) {
        lines.push({ type: 'header', label, isNew: true });
        lines.push({ type: 'add', prefix: '+', field: 'shape', newVal: node.data.shape });
        lines.push({ type: 'add', prefix: '+', field: 'label', newVal: label });
        if (node.data.color) {
          lines.push({ type: 'add', prefix: '+', field: 'color', newVal: node.data.color });
        }
      } else {
        const shapeChanged = existing.data.shape !== node.data.shape;
        const colorChanged = existing.data.color !== node.data.color;
        const labelChanged = (existing.data.label || '') !== label;
        if (shapeChanged || colorChanged || labelChanged) {
          lines.push({ type: 'header', label });
          if (labelChanged) {
            lines.push({ type: 'change', prefix: '~', field: 'label', oldVal: existing.data.label, newVal: label });
          }
          if (shapeChanged) {
            lines.push({ type: 'change', prefix: '~', field: 'shape', oldVal: existing.data.shape, newVal: node.data.shape });
          }
          if (colorChanged) {
            lines.push({ type: 'change', prefix: '~', field: 'color', oldVal: existing.data.color, newVal: node.data.color });
          }
        }
      }
    }

    for (const node of existingNodes) {
      const label = node.data.label || '';
      if (!newByLabel.has(label.toLowerCase())) {
        lines.push({ type: 'header', label, isNew: false });
        lines.push({ type: 'remove', prefix: '-', field: 'shape', oldVal: node.data.shape });
        lines.push({ type: 'remove', prefix: '-', field: 'removed', oldVal: 'entire node' });
      }
    }

    const oldEdgeKeys = new Set(
      existingEdges.map(e => {
        const src = existingNodes.find(n => n.id === e.source)?.data.label || e.source;
        const tgt = existingNodes.find(n => n.id === e.target)?.data.label || e.target;
        return `${src.toLowerCase()}→${tgt.toLowerCase()}`;
      })
    );
    const newEdgeKeys = new Set(
      edges.map(e => {
        const src = nodes.find(n => n.id === e.source)?.data.label || e.source;
        const tgt = nodes.find(n => n.id === e.target)?.data.label || e.target;
        return `${src.toLowerCase()}→${tgt.toLowerCase()}`;
      })
    );

    const addedEdges = [...newEdgeKeys].filter(k => !oldEdgeKeys.has(k));
    const removedEdges = [...oldEdgeKeys].filter(k => !newEdgeKeys.has(k));

    if (addedEdges.length > 0 || removedEdges.length > 0) {
      lines.push({ type: 'header', label: 'Connections' });
      for (const e of addedEdges) {
        lines.push({ type: 'add', prefix: '+', field: 'connection', newVal: e });
      }
      for (const e of removedEdges) {
        lines.push({ type: 'remove', prefix: '-', field: 'connection', oldVal: e });
      }
    }

    return lines.length > 0 ? lines : null;
  }, [existingNodes, existingEdges, nodes, edges]);

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogOverlay />
      <DialogContent size="2xl" showCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <GitBranch className="size-4 text-indigo-400" />
            </div>
            <div>
              <DialogTitle>Preview Changes</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            {/* New symbols: always show */}
            {nodes.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  New Symbols ({nodes.length})
                </label>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                  {nodes.map((node) => (
                    <div key={node.id} className="rounded-lg border border-border/40 bg-muted overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/20 bg-muted/50">
                        <GitBranch className="size-3 text-indigo-400 shrink-0" />
                        <span className="text-[11px] font-semibold text-foreground">{node.data.label}</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{node.data.shape}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono">
                        <span className="text-gray-500">Shape:</span>
                        <span className="text-gray-300">{node.data.shape}</span>
                        {node.data.color && (
                          <>
                            <span className="text-gray-500 ml-2">Color:</span>
                            <span className="text-gray-300">{node.data.color}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diff: only when existing content */}
            {diff && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">Changes</label>
                <div className="rounded-lg border border-border/40 overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar text-[10px] font-mono leading-relaxed">
                  <div className="divide-y divide-border/10">
                    {diff.map((line, li) => {
                      if (line.type === 'header') {
                        return (
                          <div key={li} className="flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-border/30">
                            {line.isNew && (
                              <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">NEW</span>
                            )}
                            <span className="text-[11px] font-semibold text-foreground">{line.label}</span>
                          </div>
                        );
                      }
                      const isAdd = line.type === 'add';
                      const isRemove = line.type === 'remove';
                      const isChange = line.type === 'change';
                      const bg = isAdd ? 'bg-emerald-900/20' : isRemove ? 'bg-red-900/20' : isChange ? 'bg-amber-900/20' : '';
                      const prefixColor = isAdd ? 'text-emerald-400' : isRemove ? 'text-red-400' : 'text-amber-400';
                      const valColor = isAdd ? 'text-emerald-300' : isRemove ? 'text-red-400' : 'text-amber-300';
                      const fieldColor = isAdd ? 'text-emerald-400/60' : isRemove ? 'text-red-400/60' : 'text-amber-400/60';
                      return (
                        <div key={li} className={`flex items-center gap-1 px-3 py-[2px] ${bg}`}>
                          <span className={`w-4 shrink-0 select-none ${prefixColor}`}>{line.prefix}</span>
                          <span className={`w-20 shrink-0 ${fieldColor}`}>{line.field}</span>
                          {line.oldVal && <span className="text-red-400/70 line-through">{line.oldVal}</span>}
                          {line.oldVal && line.newVal && <span className="text-gray-600">→</span>}
                          {line.newVal && <span className={valColor}>{line.newVal}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {!diff && !nodes.length && (
              <p className="text-xs text-muted-foreground">No changes detected.</p>
            )}
          </div>
        </DialogBody>

        <div className="flex items-center justify-between gap-3 px-6 pb-6">
          <div className="flex items-center gap-3">
            {canvasGroups.length > 0 && (
              <div className="flex items-center gap-2">
                <Layers className="size-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">Replace:</span>
                <Select value={replaceGroup ?? ''} onValueChange={(v) => setReplaceGroup(v || null)}>
                  <SelectTrigger className="h-7 text-[12px]">
                    <SelectValue placeholder="All Symbols" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Symbols</SelectItem>
                    {canvasGroups.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2">
              <X className="size-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={() => onConfirm(replaceGroup || undefined)} className="gap-2">
              <Check className="size-4" />
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
